const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const { requireRole } = require('../../middleware/role');
const mongoose = require('mongoose');
const Batch = require('../../models/Batch');
const Problem = require('../../models/Problem');
const TestCase = require('../../models/TestCase');
const Collection = require('../../models/Collection');
const Topic = require('../../models/Topic');
const ProblemTopic = require('../../models/ProblemTopic');
const Submission = require('../../models/Submission');
const User = require('../../models/User');
const { getCompilerById, mapLegacyToCompiler } = require('../../services/compilerRegistry');

/**
 * CREATE PROBLEM (ADMIN)
 * POST /api/admin/problems
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      constraints,
      inputFormat,
      outputFormat,
      examples,
      starterCode,
      allowedLanguages,
      compiler,
      status,
      batch,
      scope = 'GLOBAL',
      collectionId,
      topicId,
    } = req.body;

    // Validate required fields
    if (!title || !description || !difficulty) {
      return res.status(400).json({ success: false, message: 'Title, description, and difficulty are required' });
    }

    // Validate difficulty enum
    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    if (!allowedDifficulties.includes(difficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty' });
    }

    // Validate scope enum
    const allowedScopes = ['GLOBAL', 'BATCH'];
    if (!allowedScopes.includes(scope)) {
      return res.status(400).json({ success: false, message: 'Invalid scope' });
    }

    // Validate batch if provided for BATCH scope
    let batchId = batch;
    if (scope === 'BATCH' && batchId) {
      if (!mongoose.Types.ObjectId.isValid(batchId)) {
        return res.status(400).json({ success: false, message: 'Invalid batch id' });
      }
      const batchDoc = await Batch.findById(batchId);
      if (!batchDoc) {
        return res.status(404).json({ success: false, message: 'Batch not found' });
      }
    }

    // Validate status enum if provided
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Validate allowedLanguages enum if provided
    const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
    if (allowedLanguages && Array.isArray(allowedLanguages)) {
      const invalid = allowedLanguages.find(l => !validLanguages.includes(l));
      if (invalid === 'javascript') {
        return res.status(400).json({ success: false, code: 'UNSUPPORTED_LANGUAGE', message: 'JavaScript is not supported' });
      }
      if (invalid) {
        return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
      }
    }

    // Resolve compilers for all allowed languages server-side
    const compilers = new Map();
    if (allowedLanguages && Array.isArray(allowedLanguages)) {
      for (const lang of allowedLanguages) {
        const compilerId = mapLegacyToCompiler(lang);
        if (!compilerId) {
          return res.status(400).json({ success: false, code: 'COMPILER_NOT_SUPPORTED', message: `No compiler mapping for language: ${lang}` });
        }
        compilers.set(lang, compilerId);
      }
    }

    // Validate collection/topic relationship if provided
    if (collectionId && topicId) {
      if (!mongoose.Types.ObjectId.isValid(collectionId) || !mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({ success: false, message: 'Invalid collection or topic id' });
      }
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ success: false, message: 'Topic not found' });
      }
      if (topic.collection.toString() !== collectionId) {
        return res.status(400).json({ success: false, message: 'Selected topic does not belong to the selected collection' });
      }
      const collection = await Collection.findById(collectionId);
      if (!collection) {
        return res.status(404).json({ success: false, message: 'Collection not found' });
      }
    } else if (collectionId || topicId) {
      return res.status(400).json({ success: false, message: 'Both collectionId and topicId must be provided together' });
    }

    // Generate slug
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[-]+|-+$/g, '');

    // Check duplicate slug
    const existing = await Problem.findOne({ slug });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }

    const creatorId = req.user.id;

    const problem = await Problem.create({
      title: title.trim(),
      slug,
      description: description.trim(),
      difficulty,
      constraints: constraints ? constraints.trim() : undefined,
      inputFormat: inputFormat ? inputFormat.trim() : undefined,
      outputFormat: outputFormat ? outputFormat.trim() : undefined,
      examples: Array.isArray(examples) ? examples : [],
      starterCode: starterCode && typeof starterCode === 'object' ? starterCode : {},
      allowedLanguages: Array.isArray(allowedLanguages) ? allowedLanguages : [],
      compilers: Object.fromEntries(compilers),
      scope,
      batch: scope === 'BATCH' ? batchId : undefined,
      createdBy: creatorId,
      status: status || 'DRAFT',
    });

    // If collectionId and topicId are provided, create ProblemTopic link
    if (collectionId && topicId) {
      // Validate again (though we already did) and create link
      const topic = await Topic.findById(topicId);
      const collection = await Collection.findById(collectionId);
      // Ensure the topic belongs to the collection (double-check)
      if (topic.collection.toString() !== collectionId) {
        // This should not happen due to earlier validation, but just in case
        await Problem.findByIdAndDelete(problem._id); // cleanup
        return res.status(400).json({ success: false, message: 'Selected topic does not belong to the selected collection' });
      }
      // Check if link already exists (to avoid duplicate key error)
      const existingLink = await ProblemTopic.findOne({ problem: problem._id, topic: topicId });
      if (!existingLink) {
        await ProblemTopic.create({
          problem: problem._id,
          collection: collectionId,
          topic: topicId,
          createdBy: creatorId,
        });
      }
      // If link exists, we do nothing (it's already linked)
    }

    await problem.populate([
      { path: 'createdBy', select: '-passwordHash' },
      { path: 'batch', select: '-__v' },
    ]);

    // Fetch collection and topic if linked
    let collectionData = null;
    let topicData = null;
    if (collectionId && topicId) {
      const ProblemTopic = require('../../models/ProblemTopic');
      const problemTopic = await ProblemTopic.findOne({ problem: problem._id });
      if (problemTopic) {
        await problemTopic.populate([
          { path: 'collection', select: '-__v' },
          { path: 'topic', select: '-__v' },
        ]);
        if (problemTopic.collection) {
          collectionData = { id: problemTopic.collection._id, name: problemTopic.collection.name };
        }
        if (problemTopic.topic) {
          topicData = { id: problemTopic.topic._id, name: problemTopic.topic.name };
        }
      }
    }

    const data = {
      id: problem._id,
      title: problem.title,
      slug: problem.slug,
      description: problem.description,
      difficulty: problem.difficulty,
      constraints: problem.constraints,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      examples: problem.examples,
      starterCode: problem.starterCode,
      allowedLanguages: problem.allowedLanguages,
      compilers: problem.compilers || {},
      scope: problem.scope,
      batch: problem.batch ? { id: problem.batch._id, name: problem.batch.name, code: problem.batch.code } : null,
      collection: collectionData,
      topic: topicData,
      createdBy: {
        id: problem.createdBy._id,
        name: problem.createdBy.name,
        email: problem.createdBy.email,
        role: problem.createdBy.role,
        status: problem.createdBy.status,
      },
      status: problem.status,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    };

    return res.status(201).json({ success: true, data });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Problem with this slug already exists' });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error creating problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * LIST ALL PROBLEMS (ADMIN)
 * GET /api/admin/problems
 */
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      filter.status = status;
    } else {
      // Default to exclude ARCHIVED problems if no status provided
      filter.status = { $ne: 'ARCHIVED' };
    }
    const problems = await Problem.find(filter)
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');

    const data = problems.map(p => ({
      id: p._id,
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      status: p.status,
      batch: p.batch ? { id: p.batch._id, name: p.batch.name, code: p.batch.code } : null,
      createdBy: p.createdBy ? {
        id: p.createdBy._id,
        name: p.createdBy.name,
        email: p.createdBy.email,
        role: p.createdBy.role,
        status: p.createdBy.status,
      } : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error listing problems:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET SINGLE PROBLEM (ADMIN)
 * GET /api/admin/problems/:problemId
 */
router.get('/:problemId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { problemId } = req.params;
    if (problemId === 'template') {
      return next();
    }
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }
    const problem = await Problem.findById(problemId)
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }
    // Fetch collection and topic if linked
    let collectionData = null;
    let topicData = null;
    const problemTopic = await ProblemTopic.findOne({ problem: problem._id });
    if (problemTopic) {
      await problemTopic.populate([
        { path: 'collection', select: '-__v' },
        { path: 'topic', select: '-__v' },
      ]);
      if (problemTopic.collection) {
        collectionData = { id: problemTopic.collection._id, name: problemTopic.collection.name };
      }
      if (problemTopic.topic) {
        topicData = { id: problemTopic.topic._id, name: problemTopic.topic.name };
      }
    }
    const data = {
      id: problem._id,
      title: problem.title,
      slug: problem.slug,
      description: problem.description,
      difficulty: problem.difficulty,
      constraints: problem.constraints,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      examples: problem.examples,
      starterCode: problem.starterCode,
      allowedLanguages: problem.allowedLanguages,
      compilers: problem.compilers || {},
      scope: problem.scope,
      collection: collectionData,
      topic: topicData,
      batch: problem.batch ? { id: problem.batch._id, name: problem.batch.name, code: problem.batch.code } : null,
      createdBy: problem.createdBy ? {
        id: problem.createdBy._id,
        name: problem.createdBy.name,
        email: problem.createdBy.email,
        role: problem.createdBy.role,
        status: problem.createdBy.status,
      } : null,
      status: problem.status,
      createdAt: problem.createdAt,
      updatedAt: problem.updatedAt,
    };
    return res.json({ success: true, data });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error getting problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * UPDATE PROBLEM (ADMIN)
 * PATCH /api/admin/problems/:problemId
 */
router.patch('/:problemId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { problemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    const {
      title,
      description,
      difficulty,
      constraints,
      inputFormat,
      outputFormat,
      examples,
      starterCode,
      allowedLanguages,
      status,
      batch,
      collectionId,
      topicId,
    } = req.body;

    // Use transaction if supported
    if (mongoose.__transactionSupport) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const problem = await Problem.findById(problemId, null, { session });
          if (!problem) {
            throw new Error('Problem not found');
          }

          // Validate enums if provided
          if (difficulty) {
            const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
            if (!allowedDifficulties.includes(difficulty)) {
              throw new Error('Invalid difficulty');
            }
          }
          if (status) {
            const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
            if (!allowedStatus.includes(status)) {
              throw new Error('Invalid status');
            }
          }
          if (allowedLanguages && Array.isArray(allowedLanguages)) {
            const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
            const invalid = allowedLanguages.find(l => !validLanguages.includes(l));
            if (invalid === 'javascript') {
              throw new Error('JavaScript is not supported');
            }
            if (invalid) {
              throw new Error(`Invalid language: ${invalid}`);
            }
            // Resolve compilers server-side
            const compilers = new Map();
            for (const lang of allowedLanguages) {
              const compilerId = mapLegacyToCompiler(lang);
              if (!compilerId) {
                throw new Error(`No compiler mapping for language: ${lang}`);
              }
              compilers.set(lang, compilerId);
            }
            problem.compilers = Object.fromEntries(compilers);
          }
          if (batch) {
            if (!mongoose.Types.ObjectId.isValid(batch)) {
              throw new Error('Invalid batch id');
            }
            const batchDoc = await Batch.findById(batch, null, { session });
            if (!batchDoc) {
              throw new Error('Batch not found');
            }
          }
          // Validate collection/topic relationship if provided
          if (collectionId !== undefined && topicId !== undefined) {
            if (!mongoose.Types.ObjectId.isValid(collectionId) || !mongoose.Types.ObjectId.isValid(topicId)) {
              throw new Error('Invalid collection or topic id');
            }
            const topic = await Topic.findById(topicId, null, { session });
            if (!topic) {
              throw new Error('Topic not found');
            }
            if (topic.collection.toString() !== collectionId) {
              throw new Error('Topic does not belong to collection');
            }
            const collection = await Collection.findById(collectionId, null, { session });
            if (!collection) {
              throw new Error('Collection not found');
            }
          } else if ((collectionId === undefined && topicId !== undefined) || (collectionId !== undefined && topicId === undefined)) {
            throw new Error('Both collectionId and topicId must be provided together');
          }

          // If title changes, regenerate slug and check duplicate
          if (title && title.trim() !== problem.title) {
            const newSlug = title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^[-]+|-+$/g, '');
            const existing = await Problem.findOne({ slug: newSlug, _id: { $ne: problemId } }, null, { session });
            if (existing) {
              throw new Error('Conflict: slug already exists');
            }
            problem.slug = newSlug;
          }

          // Apply updates
          if (title !== undefined) problem.title = title.trim();
          if (description !== undefined) problem.description = description.trim();
          if (difficulty !== undefined) problem.difficulty = difficulty;
          if (constraints !== undefined) problem.constraints = constraints ? constraints.trim() : undefined;
          if (inputFormat !== undefined) problem.inputFormat = inputFormat ? inputFormat.trim() : undefined;
          if (outputFormat !== undefined) problem.outputFormat = outputFormat ? outputFormat.trim() : undefined;
          if (examples !== undefined) problem.examples = Array.isArray(examples) ? examples : [];
          if (starterCode !== undefined) problem.starterCode = starterCode && typeof starterCode === 'object' ? starterCode : {};
          if (allowedLanguages !== undefined) problem.allowedLanguages = Array.isArray(allowedLanguages) ? allowedLanguages : [];
          if (status !== undefined) {
            // Handle archiving/unarchiving with archivedFrom field
            if (status === 'ARCHIVED' && problem.status !== 'ARCHIVED') {
              // Archiving: store current status in archivedFrom
              problem.archivedFrom = problem.status;
            } else if ((status === 'DRAFT' || status === 'PUBLISHED') && problem.status === 'ARCHIVED') {
              // Unarchiving: restore previous status from archivedFrom
              problem.status = problem.archivedFrom || status; // fallback to provided status if archivedFrom missing
              problem.archivedFrom = null;
            } else {
              problem.status = status;
            }
          }
          if (batch !== undefined) problem.batch = batch;

          // Save problem changes
          await problem.save({ session });

          // Update ProblemTopic link only if provided
          if (collectionId !== undefined && topicId !== undefined) {
            const ProblemTopic = require('../../models/ProblemTopic');
            // Upsert the link: update if exists, insert if not
            await ProblemTopic.findOneAndUpdate(
              { problem: problemId },
              { collection: collectionId, topic: topicId, createdBy: req.user.id },
              { upsert: true, returnDocument: 'after', session }
            );
          }

          // Fetch updated problem with populations
          const updated = await Problem.findById(problemId, null, { session })
            .populate({ path: 'createdBy', select: '-passwordHash' })
            .populate({ path: 'batch', select: '-__v' })
            .select('-__v');

          const data = {
            id: updated._id,
            title: updated.title,
            slug: updated.slug,
            description: updated.description,
            difficulty: updated.difficulty,
            constraints: updated.constraints,
            inputFormat: updated.inputFormat,
            outputFormat: updated.outputFormat,
            examples: updated.examples,
            starterCode: updated.starterCode,
            allowedLanguages: updated.allowedLanguages,
            compilers: updated.compilers || {},
            scope: updated.scope,
            batch: updated.batch ? { id: updated.batch._id, name: updated.batch.name, code: updated.batch.code } : null,
            createdBy: updated.createdBy ? {
              id: updated.createdBy._id,
              name: updated.createdBy.name,
              email: updated.createdBy.email,
              role: updated.createdBy.role,
              status: updated.createdBy.status,
            } : null,
            status: updated.status,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          };
          return res.json({ success: true, data });
        });
        await session.endSession();
      } catch (error) {
        await session.endSession();
        if (error.message === 'Problem not found') {
          return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes('Conflict')) {
          return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
      }
    } else {
      // Fallback: non-transactional update (current behavior)
      const problem = await Problem.findById(problemId);
      if (!problem) {
        return res.status(404).json({ success: false, message: 'Problem not found' });
      }

      // Validate enums if provided
      if (difficulty) {
        const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
        if (!allowedDifficulties.includes(difficulty)) {
          return res.status(400).json({ success: false, message: 'Invalid difficulty' });
        }
      }
      if (status) {
        const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
        if (!allowedStatus.includes(status)) {
          return res.status(400).json({ success: false, message: 'Invalid status' });
        }
      }
      if (allowedLanguages && Array.isArray(allowedLanguages)) {
        const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
        const invalid = allowedLanguages.find(l => !validLanguages.includes(l));
        if (invalid === 'javascript') {
          return res.status(400).json({ success: false, code: 'UNSUPPORTED_LANGUAGE', message: 'JavaScript is not supported' });
        }
        if (invalid) {
          return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
        }
        // Resolve compilers server-side
        const compilers = new Map();
        for (const lang of allowedLanguages) {
          const compilerId = mapLegacyToCompiler(lang);
          if (!compilerId) {
            return res.status(400).json({ success: false, code: 'COMPILER_NOT_SUPPORTED', message: `No compiler mapping for language: ${lang}` });
          }
          compilers.set(lang, compilerId);
        }
        problem.compilers = Object.fromEntries(compilers);
      }
      if (batch) {
        if (!mongoose.Types.ObjectId.isValid(batch)) {
          return res.status(400).json({ success: false, message: 'Invalid batch id' });
        }
        const batchDoc = await Batch.findById(batch);
        if (!batchDoc) {
          return res.status(404).json({ success: false, message: 'Batch not found' });
        }
      }
      // Validate collection/topic relationship if provided
      if (collectionId !== undefined && topicId !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(collectionId) || !mongoose.Types.ObjectId.isValid(topicId)) {
          return res.status(400).json({ success: false, message: 'Invalid collection or topic id' });
        }
        const topic = await Topic.findById(topicId);
        if (!topic) {
          return res.status(404).json({ success: false, message: 'Topic not found' });
        }
        if (topic.collection.toString() !== collectionId) {
          return res.status(400).json({ success: false, message: 'Topic does not belong to collection' });
        }
        const collection = await Collection.findById(collectionId);
        if (!collection) {
          return res.status(404).json({ success: false, message: 'Collection not found' });
        }
      } else if ((collectionId === undefined && topicId !== undefined) || (collectionId !== undefined && topicId === undefined)) {
        return res.status(400).json({ success: false, message: 'Both collectionId and topicId must be provided together' });
      }

      // If title changes, regenerate slug and check duplicate
      if (title && title.trim() !== problem.title) {
        const newSlug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^[-]+|-+$/g, '');
        const existing = await Problem.findOne({ slug: newSlug, _id: { $ne: problemId } });
        if (existing) {
          return res.status(409).json({ success: false, message: 'Conflict: slug already exists' });
        }
        problem.slug = newSlug;
      }

      // Apply updates
      if (title !== undefined) problem.title = title.trim();
      if (description !== undefined) problem.description = description.trim();
      if (difficulty !== undefined) problem.difficulty = difficulty;
      if (constraints !== undefined) problem.constraints = constraints ? constraints.trim() : undefined;
      if (inputFormat !== undefined) problem.inputFormat = inputFormat ? inputFormat.trim() : undefined;
      if (outputFormat !== undefined) problem.outputFormat = outputFormat ? outputFormat.trim() : undefined;
      if (examples !== undefined) problem.examples = Array.isArray(examples) ? examples : [];
      if (starterCode !== undefined) problem.starterCode = starterCode && typeof starterCode === 'object' ? starterCode : {};
      if (allowedLanguages !== undefined) problem.allowedLanguages = Array.isArray(allowedLanguages) ? allowedLanguages : [];
      if (status !== undefined) {
        // Handle archiving/unarchiving with archivedFrom field
        if (status === 'ARCHIVED' && problem.status !== 'ARCHIVED') {
          // Archiving: store current status in archivedFrom and set status to ARCHIVED
          problem.archivedFrom = problem.status;
          problem.status = 'ARCHIVED';
        } else if ((status === 'DRAFT' || status === 'PUBLISHED') && problem.status === 'ARCHIVED') {
          // Unarchiving: restore previous status from archivedFrom
          problem.status = problem.archivedFrom || status; // fallback to provided status if archivedFrom missing
          problem.archivedFrom = null;
        } else {
          problem.status = status;
        }
      }
      if (batch !== undefined) problem.batch = batch;

      // Save problem changes
      await problem.save();

      // Update ProblemTopic link only if provided
      if (collectionId !== undefined && topicId !== undefined) {
        const ProblemTopic = require('../../models/ProblemTopic');
        // Upsert the link: update if exists, insert if not
        await ProblemTopic.findOneAndUpdate(
          { problem: problemId },
          { collection: collectionId, topic: topicId, createdBy: req.user.id },
          { upsert: true, returnDocument: 'after' }
        );
      }

      const updated = await Problem.findById(problemId)
        .populate({ path: 'createdBy', select: '-passwordHash' })
        .populate({ path: 'batch', select: '-__v' })
        .select('-__v');

      const data = {
        id: updated._id,
        title: updated.title,
        slug: updated.slug,
        description: updated.description,
        difficulty: updated.difficulty,
        constraints: updated.constraints,
        inputFormat: updated.inputFormat,
        outputFormat: updated.outputFormat,
        examples: updated.examples,
        starterCode: updated.starterCode,
        allowedLanguages: updated.allowedLanguages,
        compilers: updated.compilers || {},
        scope: updated.scope,
        batch: updated.batch ? { id: updated.batch._id, name: updated.batch.name, code: updated.batch.code } : null,
        createdBy: updated.createdBy ? {
          id: updated.createdBy._id,
          name: updated.createdBy.name,
          email: updated.createdBy.email,
          role: updated.createdBy.role,
          status: updated.createdBy.status,
        } : null,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
      return res.json({ success: true, data });
    }
  } catch (err) {
    if (err.message === 'Problem not found') {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.message.includes('Conflict')) {
      return res.status(409).json({ success: false, message: err.message });
    }
    if (process.env.NODE_ENV !== 'test') console.error('Error updating problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE / ARCHIVE PROBLEM (ADMIN)
 * DELETE /api/admin/problems/:problemId
 */
router.delete('/:problemId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { problemId } = req.params;
  try {
    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    if (problem.status === 'ARCHIVED') {
      // Hard delete permanently with transaction if supported
      if (mongoose.__transactionSupport) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await ProblemTopic.deleteMany({ problem: problemId }, { session });
            await TestCase.deleteMany({ problem: problemId }, { session });
            await Submission.deleteMany({ problem: problemId }, { session });
            await Problem.findByIdAndDelete(problemId, { session });
          });
          await session.endSession();
          return res.json({ success: true, data: null, hardDeleted: true });
        } catch (error) {
          await session.endSession();
          throw error;
        }
      } else {
        // Fallback: sequential deletes (not atomic)
        await ProblemTopic.deleteMany({ problem: problemId });
        await TestCase.deleteMany({ problem: problemId });
        await Submission.deleteMany({ problem: problemId });
        await Problem.findByIdAndDelete(problemId);

        return res.json({ success: true, data: null, hardDeleted: true });
      }
    }
    // Soft delete by setting status to ARCHIVED
    const updated = await Problem.findByIdAndUpdate(problemId, { status: 'ARCHIVED' }, { new: true });
    return res.json({ success: true, data: null, hardDeleted: false });
  } catch (err) {
    console.error({
      name: err.name,
      message: err.message,
      code: err.code,
      codeName: err.codeName,
      stack: err.stack
    });
    return res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  }
});

/**
 * IMPORT PREVIEW (JSON)
 * POST /api/admin/problems/import/preview
 * Returns preview data without persisting changes
 */
router.post('/import/preview', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { problems } = req.body;

    if (!Array.isArray(problems)) {
      return res.status(400).json({
        success: false,
        message: 'Expected an array of problems',
      });
    }

    if (problems.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 problems per import',
      });
    }

    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
    const errors = [];
    const newProblems = [];
    const existingProblems = [];
    function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[-]+|-+$/g, ''); }

    // Preprocess entries and collect slugs
    const entries = [];
    const slugs = [];
    for (let i = 0; i < problems.length; i++) {
      const entry = problems[i];
      const row = i + 1;
      let p = entry;
      if (entry.problem && typeof entry.problem === 'object') {
        p = entry.problem;
      }
      entries.push({ row, p });
      const slug = slugify(p.title || '');
      slugs.push(slug);
    }

    // Find existing slugs in a single query
    const existingProblemsDB = await Problem.find({ slug: { $in: slugs } }).select('_id slug title description difficulty constraints inputFormat outputFormat examples starterCode allowedLanguages');
    const existingProblemMap = new Map(existingProblemsDB.map(p => [p.slug, p]));

    for (const { row, p } of entries) {
      // Validate required fields
      if (!p.title || !p.description || !p.difficulty) {
        errors.push({ row, field: 'title', message: 'Missing required fields (title, description, or difficulty)' });
        continue;
      }

      if (!allowedDifficulties.includes(p.difficulty)) {
        errors.push({ row, field: 'difficulty', message: 'Invalid difficulty' });
        continue;
      }

      if (p.allowedLanguages && Array.isArray(p.allowedLanguages)) {
        const invalid = p.allowedLanguages.find(l => !validLanguages.includes(l));
        if (invalid === 'javascript') {
          errors.push({ row, field: 'allowedLanguages', message: 'JavaScript is not supported' });
          continue;
        }
        if (invalid) {
          errors.push({ row, field: 'allowedLanguages', message: `Invalid language: ${invalid}` });
          continue;
        }
      }

      const slug = slugify(p.title);
      const existingProblem = existingProblemMap.get(slug);

      if (existingProblem) {
        // Build current fields for comparison
        const currentFields = {
          title: existingProblem.title,
          description: existingProblem.description,
          difficulty: existingProblem.difficulty,
          constraints: existingProblem.constraints,
          inputFormat: existingProblem.inputFormat,
          outputFormat: existingProblem.outputFormat,
          examples: existingProblem.examples,
          starterCode: existingProblem.starterCode,
          allowedLanguages: existingProblem.allowedLanguages,
          status: existingProblem.status,
        };

        // Build imported fields
        const importedFields = {
          title: p.title.trim(),
          description: p.description.trim(),
          difficulty: p.difficulty,
          constraints: p.constraints ? p.constraints.trim() : undefined,
          inputFormat: p.inputFormat ? p.inputFormat.trim() : undefined,
          outputFormat: p.outputFormat ? p.outputFormat.trim() : undefined,
          examples: Array.isArray(p.examples) ? p.examples : [],
          starterCode: p.starterCode && typeof p.starterCode === 'object' ? p.starterCode : {},
          allowedLanguages: Array.isArray(p.allowedLanguages) ? p.allowedLanguages : [],
          status: p.status || 'DRAFT',
        };

        // Compute differences
        const changes = [];
        Object.keys(currentFields).forEach(key => {
          const currentVal = currentFields[key];
          const importedVal = importedFields[key];
          // Handle special cases for comparison
          if (key === 'examples' || key === 'starterCode' || key === 'allowedLanguages') {
            if (JSON.stringify(currentVal) !== JSON.stringify(importedVal)) {
              changes.push({ field: key, current: currentVal, imported: importedVal });
            }
          } else {
            if (currentVal !== importedVal) {
              changes.push({ field: key, current: currentVal, imported: importedVal });
            }
          }
        });

        existingProblems.push({
          _id: existingProblem._id,
          slug,
          title: p.title,
          changes,
          existingFields: currentFields,
          importedFields,
        });
      } else {
        newProblems.push({ row, slug: slugify(p.title), title: p.title });
      }
    }

    res.json({
      success: true,
      summary: {
        total: problems.length,
        new: newProblems.length,
        existing: existingProblems.length,
        errors: errors.length,
      },
      errors,
      newProblems,
      existingProblems,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Import Preview Error] name:', error.name);
      console.error('[Import Preview Error] message:', error.message);
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

/**
 * IMPORT PROBLEMS (JSON)
 * POST /api/admin/problems/import
 */
router.post('/import', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { problems } = req.body;

    if (!Array.isArray(problems)) {
      return res.status(400).json({
        success: false,
        message: 'Expected an array of problems',
      });
    }

    if (problems.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 problems per import',
      });
    }

    const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
    const allowedScopes = ['GLOBAL', 'BATCH'];
    const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
    const errors = [];
    const validProblems = [];
    const topicLinks = [];
    function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[-]+|-+$/g, ''); }

    // Preprocess entries and collect slugs for bulk duplicate check
    const entries = [];
    const slugs = [];
    for (let i = 0; i < problems.length; i++) {
      const entry = problems[i];
      const row = i + 1;
      // Detect new format: has 'problem' key
      let p = entry;
      let collectionName = null, topicName = null;
      if (entry.problem && typeof entry.problem === 'object') {
        p = entry.problem;
        collectionName = entry.collection;
        topicName = entry.topic;
      }
      entries.push({ row, p, collectionName, topicName });
      const slug = slugify(p.title || '');
      slugs.push(slug);
    }

    // Find existing slugs in a single query
    const existingProblems = await Problem.find({ slug: { $in: slugs } }).select('_id slug');
    const existingProblemMap = new Map(existingProblems.map(p => [p.slug, p]));

    for (const { row, p, collectionName, topicName } of entries) {
      // Validate required fields
      if (!p.title || !p.description || !p.difficulty) {
        errors.push({ row, field: 'title', message: 'Missing required fields (title, description, or difficulty)' });
        continue;
      }

      if (!allowedDifficulties.includes(p.difficulty)) {
        errors.push({ row, field: 'difficulty', message: 'Invalid difficulty' });
        continue;
      }

      const scope = p.scope || 'GLOBAL';
      if (!allowedScopes.includes(scope)) {
        errors.push({ row, field: 'scope', message: 'Invalid scope' });
        continue;
      }

      if (p.status && !allowedStatus.includes(p.status)) {
        errors.push({ row, field: 'status', message: 'Invalid status' });
        continue;
      }

      if (p.allowedLanguages && Array.isArray(p.allowedLanguages)) {
        const invalid = p.allowedLanguages.find(l => !validLanguages.includes(l));
        if (invalid === 'javascript') {
          errors.push({ row, field: 'allowedLanguages', message: 'JavaScript is not supported' });
          continue;
        }
        if (invalid) {
          errors.push({ row, field: 'allowedLanguages', message: `Invalid language: ${invalid}` });
          continue;
        }
      }

      // Resolve compilers for all allowed languages
      const compilers = new Map();
      if (p.allowedLanguages && Array.isArray(p.allowedLanguages)) {
        for (const lang of p.allowedLanguages) {
          const compilerId = mapLegacyToCompiler(lang);
          if (!compilerId) {
            errors.push({ row, field: 'allowedLanguages', message: `No compiler mapping for: ${lang}` });
            continue;
          }
          compilers.set(lang, compilerId);
        }
        if (compilers.size !== p.allowedLanguages.length) continue;
      }

      // Force GLOBAL scope if collection/topic linking present
      if (collectionName || topicName) {
        if (scope !== 'GLOBAL') {
          errors.push({ row, message: 'Problems linked to collections must have GLOBAL scope' });
          continue;
        }
      }

      const slug = slugify(p.title);
      const existingProblem = existingProblemMap.get(slug);

      if (existingProblem) {
        // Reuse existing problem - skip but track for relationship handling
        topicLinks.push({
          row,
          problem: existingProblem,
          collectionName,
          topicName,
          slug,
        });
        continue;
      }

      // Validate testCases if provided
      let testCases = [];
      if (p.testCases !== undefined) {
        if (!Array.isArray(p.testCases)) {
          errors.push({ row, field: 'testCases', message: 'testCases must be an array' });
          continue;
        }
        const seenOrder = new Set();
        let tcValid = true;
        p.testCases.forEach((tc, idx) => {
          if (tc.input == null || tc.expectedOutput == null) {
            errors.push({ row, field: 'testCases', message: `Test case ${idx + 1} requires input and expectedOutput` });
            tcValid = false;
            return;
          }
          const order = tc.order ?? idx;
          if (seenOrder.has(order)) {
            errors.push({ row, field: 'testCases', message: `Duplicate order value: ${order}` });
            tcValid = false;
            return;
          }
          seenOrder.add(order);
        });
        if (!tcValid) {
          continue; // Skip this problem if test case validation failed
        }
        testCases = p.testCases;
      }

      validProblems.push({
        title: p.title.trim(),
        slug,
        description: p.description.trim(),
        difficulty: p.difficulty,
        constraints: p.constraints ? p.constraints.trim() : undefined,
        inputFormat: p.inputFormat ? p.inputFormat.trim() : undefined,
        outputFormat: p.outputFormat ? p.outputFormat.trim() : undefined,
        examples: Array.isArray(p.examples) ? p.examples : [],
        starterCode: p.starterCode && typeof p.starterCode === 'object' ? p.starterCode : {},
        allowedLanguages: Array.isArray(p.allowedLanguages) ? p.allowedLanguages : [],
        compilers: Object.fromEntries(compilers),
        scope,
        batch: scope === 'BATCH' ? p.batch : undefined,
        createdBy: req.user.id,
        status: p.status || 'DRAFT',
        __collectionName: collectionName,
        __topicName: topicName,
        __testCases: testCases,
      });
    }

    if (validProblems.length === 0 && errors.length > 0) {
      return res.status(200).json({
        success: true,
        summary: {
          total: problems.length,
          created: 0,
          failed: errors.length,
        },
        errors,
      });
    }

    const created = await Problem.insertMany(validProblems);

    // Create TestCases for imported problems that specified them
    for (let i = 0; i < validProblems.length; i++) {
      const testCases = validProblems[i].__testCases;
      if (!testCases || testCases.length === 0) continue;
      const problemId = created[i]._id;
      try {
        await TestCase.create(testCases.map((tc, idx) => ({
          problem: problemId,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: tc.isHidden === true,
          sampleExplanation: tc.sampleExplanation || undefined,
          order: tc.order ?? idx,
        })));
      } catch (tcerr) {
        // Roll back the orphan problem so no half-created entry survives
        await Problem.findByIdAndDelete(problemId);
        if (process.env.NODE_ENV !== 'test') console.error('Error importing test cases:', tcerr);
        throw tcerr;
      }
    }

    // Handle collection/topic linking for entries that specified them
    const linkingOps = [];
    for (let i = 0; i < validProblems.length; i++) {
      const v = validProblems[i];
      if (v.__collectionName && v.__topicName) {
        // Find or create collection (reuse by slug or name)
        const colSlug = slugify(v.__collectionName);
        let collection = await Collection.findOne({ slug: colSlug });
        if (!collection) {
          // Fallback to name match (case-sensitive)
          collection = await Collection.findOne({ name: v.__collectionName.trim() });
        }
        if (!collection) {
          collection = await Collection.create({
            name: v.__collectionName.trim(),
            slug: colSlug,
            createdBy: req.user.id,
          });
        }
        // Find or create topic within collection
        const topicSlug = slugify(v.__topicName);
        let topic = await Topic.findOne({ collection: collection._id, slug: topicSlug });
        if (!topic) {
          topic = await Topic.create({
            name: v.__topicName.trim(),
            slug: topicSlug,
            collection: collection._id,
            createdBy: req.user.id,
          });
        }
        // Link problem: check if ProblemTopic already exists for this problem and topic
        const problemId = created[i]._id;
        const existingLink = await ProblemTopic.findOne({ problem: problemId, topic: topic._id });
        if (!existingLink) {
          linkingOps.push(ProblemTopic.create({
            problem: problemId,
            collection: collection._id, // derived from the topic, ensuring consistency
            topic: topic._id,
            createdBy: req.user.id,
          }));
        }
        // If link exists, we skip creating a duplicate
      }
    }
    if (linkingOps.length > 0) {
      await Promise.all(linkingOps);
    }

    res.json({
      success: true,
      summary: {
        total: problems.length,
        created: created.length,
        failed: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Import Error] name:', error.name);
      console.error('[Import Error] message:', error.message);
      console.error('[Import Error] code:', error.code);
      console.error('[Import Error] stack:', error.stack);
    }
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Problem with this slug already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

/**
 * UPDATE SINGLE PROBLEM (CONFLICT RESOLUTION)
 * PATCH /api/admin/problems/:id
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid problem id' });
    }

    const problem = await Problem.findById(id);
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found' });
    }

    const {
      title,
      description,
      difficulty,
      constraints,
      inputFormat,
      outputFormat,
      examples,
      starterCode,
      allowedLanguages,
      status,
    } = req.body;

    // Validate enums if provided
    if (difficulty) {
      const allowedDifficulties = ['EASY', 'MEDIUM', 'HARD'];
      if (!allowedDifficulties.includes(difficulty)) {
        return res.status(400).json({ success: false, message: 'Invalid difficulty' });
      }
    }
    if (status) {
      const allowedStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
    }

    // Validate allowed languages
    if (allowedLanguages && Array.isArray(allowedLanguages)) {
      const validLanguages = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];
      const invalid = allowedLanguages.find(l => !validLanguages.includes(l));
      if (invalid === 'javascript') {
        return res.status(400).json({ success: false, message: 'JavaScript is not supported' });
      }
      if (invalid) {
        return res.status(400).json({ success: false, message: `Invalid language: ${invalid}` });
      }
    }

    // Apply updates (preserve existing fields if not provided)
    if (title !== undefined) problem.title = title.trim();
    if (description !== undefined) problem.description = description.trim();
    if (difficulty !== undefined) problem.difficulty = difficulty;
    if (constraints !== undefined) problem.constraints = constraints ? constraints.trim() : undefined;
    if (inputFormat !== undefined) problem.inputFormat = inputFormat ? inputFormat.trim() : undefined;
    if (outputFormat !== undefined) problem.outputFormat = outputFormat ? outputFormat.trim() : undefined;
    if (examples !== undefined) problem.examples = Array.isArray(examples) ? examples : [];
    if (starterCode !== undefined) problem.starterCode = starterCode && typeof starterCode === 'object' ? starterCode : {};
    if (allowedLanguages !== undefined) problem.allowedLanguages = Array.isArray(allowedLanguages) ? allowedLanguages : [];
    if (status !== undefined) {
      // Handle archiving/unarchiving with archivedFrom field
      if (status === 'ARCHIVED' && problem.status !== 'ARCHIVED') {
        // Archiving: store current status in archivedFrom
        problem.archivedFrom = problem.status;
      } else if ((status === 'DRAFT' || status === 'PUBLISHED') && problem.status === 'ARCHIVED') {
        // Unarchiving: restore previous status from archivedFrom
        problem.status = problem.archivedFrom || status; // fallback to provided status if archivedFrom missing
        problem.archivedFrom = null;
      } else {
        problem.status = status;
      }
    }

    const updated = await Problem.findByIdAndUpdate(id, problem, { new: true })
      .populate({ path: 'createdBy', select: '-passwordHash' })
      .populate({ path: 'batch', select: '-__v' })
      .select('-__v');

    res.json({ success: true, data: updated });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Error updating problem:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DOWNLOAD PROBLEM TEMPLATE
 * GET /api/admin/problems/template
 */
router.get('/template', requireAuth, requireRole('ADMIN'), (req, res) => {
  const template = JSON.stringify([
    {
      collection: "Arrays & Strings",
      topic: "Two Pointer",
      problem: {
        title: "Two Sum",
        description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
        difficulty: "EASY",
        constraints: "-10^9 <= nums[i] <= 10^9",
        inputFormat: "An array of integers and a target integer.",
        outputFormat: "Two integers representing the indices.",
        examples: [{
          input: "nums = [2,7,11,15], target = 9",
          output: "[0,1]",
          explanation: "nums[0] + nums[1] = 2 + 7 = 9"
        }],
        starterCode: {
          c: "int* twoSum(int* nums, int numsSize, int target, int* returnSize) {}",
          cpp: "vector<int> twoSum(vector<int>& nums, int target) {}",
          java: "int[] twoSum(int[] nums, int target) {}",
          python: "def twoSum(nums, target):"
        },
        allowedLanguages: ["c", "cpp", "java", "python"],
        scope: "GLOBAL",
        status: "PUBLISHED",
        testCases: [
          {
            input: "2 7 11 15\n9",
            expectedOutput: "0 1",
            isHidden: false,
            sampleExplanation: "nums[0] + nums[1] = 2 + 7 = 9 returns [0, 1].",
            order: 0
          },
          {
            input: "3 2 4\n6",
            expectedOutput: "1 2",
            isHidden: true,
            order: 1
          }
        ]
      }
    }
  ], null, 2);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=problem_template.json');
  res.send(template);
});

module.exports = router;