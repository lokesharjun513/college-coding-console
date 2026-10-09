import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * PageHeader – displays a title and optional breadcrumb.
 */
export default function PageHeader({ title, description, breadcrumb, actions }) {
  return (
    <header className="admin-page-header">
      {breadcrumb && (
        <nav
          aria-label="breadcrumb"
          className="admin-breadcrumb"
        >
          {breadcrumb}
        </nav>
      )}
      <div className="admin-page-header-content">
        <div className="admin-page-header-text">
          <h1 className="admin-page-title">
            {title}
          </h1>
          {description && (
            <p className="admin-page-description">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="admin-header-actions">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  breadcrumb: PropTypes.node,
  actions: PropTypes.node,
};
