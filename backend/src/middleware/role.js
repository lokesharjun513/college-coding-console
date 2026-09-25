// Authorization middleware
// requireRole(role) – only allows users with the exact role
// requireAnyRole(...roles) – allows users with any of the listed roles
// Both assume requireAuth has already run and attached req.user

function requireRole(role) { console.log('requireRole called with required', role);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }
    next();
  };
}

function requireAnyRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }
    next();
  };
}

module.exports = { requireRole, requireAnyRole };
