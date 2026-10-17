// The Trainer design system (tokens + shared components) lives in one file.
// TrainerLayout also imports it so that every /trainer/* route is covered,
// including pages that import no stylesheet of their own.
import '../../styles/trainer.css';

export { default as StatusBadge } from './StatusBadge';
export { default as TrainerBreadcrumb } from './TrainerBreadcrumb';
export { default as TrainerConfirmDialog } from './TrainerConfirmDialog';
export { default as TrainerNotice, apiErrorMessage } from './TrainerNotice';
export { default as TrainerKpiCard } from './TrainerKpiCard';
export { default as TrainerKpiGrid } from './TrainerKpiGrid';
export { default as TrainerQuickActions } from './TrainerQuickActions';
export { default as TrainerSectionCard } from './TrainerSectionCard';
export {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
} from './TrainerStateCard';