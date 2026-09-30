// Navigation configuration for role‑aware sidebar
// Each role gets its own set of sections and items.
// Icon names correspond to the simple Icon component (see src/components/ui/Icon.jsx)

export const navigationConfig = {
  ADMIN: [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', path: '/admin', icon: 'home' },
        { label: 'Reports', path: '/admin/reports', icon: 'barChart' },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Users', path: '/admin/users', icon: 'users' },
        { label: 'Trainers', path: '/admin/trainers', icon: 'userCheck' },
        { label: 'Students', path: '/admin/students', icon: 'user' },
        { label: 'Batches', path: '/admin/batches', icon: 'layers' },
        { label: 'Problems', path: '/admin/problems', icon: 'fileCode' },
        { label: 'Submissions', path: '/admin/submissions', icon: 'fileCode' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'System Health', path: '/admin/system-health', icon: 'chartLine' },
      ],
    },
  ],
  TRAINER: [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', path: '/trainer', icon: 'home' },
      ],
    },
    {
      label: 'Management',
      items: [
        { label: 'Batches', path: '/trainer/batches', icon: 'layers' },
        { label: 'Students', path: '/trainer/students', icon: 'users' },
        { label: 'Problems', path: '/trainer/problems', icon: 'fileCode' },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { label: 'Performance', path: '/trainer/performance', icon: 'chartLine' },
      ],
    },
    {
      label: 'System',
      items: [
      ],
    },
  ],
  STUDENT: [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', path: '/student', icon: 'home' },
      ],
    },
    {
      label: 'Learning',
      items: [
        { label: 'Practice', path: '/student/practice', icon: 'notebook' },
        { label: 'Free Console', path: '/student/freeconsole', icon: 'code' },
        { label: 'Problems', path: '/student/problems', icon: 'fileCode' },
        { label: 'Progress', path: '/student/progress', icon: 'trendingUp' },
        { label: 'Performance', path: '/student/performance', icon: 'chartBar' },
      ],
    },
    {
      label: 'System',
      items: [
      ],
    },
  ],
};
