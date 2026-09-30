import React from 'react';
import PropTypes from 'prop-types';
import * as LucideIcons from 'lucide-react';

/**
 * Icon component using lucide-react for premium-quality icons.
 */
export default function Icon({ name, size = 20, color = 'currentColor', ariaLabel }) {
  // Map custom icon names (used throughout the app) to lucide-react component names.
  const iconMap = {
    home: 'Home',
    barChart: 'BarChart2',
    users: 'Users',
    userCheck: 'UserCheck',
    user: 'User',
    layers: 'Layers',
    fileCode: 'FileCode2',
    settings: 'Settings',
    userCircle: 'UserCircle',
    chartLine: 'ChartLine',
    play: 'Play',
    calendar: 'Calendar',
    trendingUp: 'TrendingUp',
    chartBar: 'BarChart',
    logOut: 'LogOut',
    menu: 'Menu',
    x: 'X',
    // Add more mappings as needed.
    chevronLeft: 'ChevronLeft',
    chevronRight: 'ChevronRight',
    code: 'Code',
    bell: 'Bell',
    notebook: 'Notebook',
    // Add more mappings as needed.
  };

  const componentName = iconMap[name] || name;
  const IconComponent = LucideIcons[componentName];
  if (!IconComponent) return null;

  return <IconComponent size={size} color={color} aria-label={ariaLabel} />;
}

Icon.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.number,
  color: PropTypes.string,
  ariaLabel: PropTypes.string,
};
