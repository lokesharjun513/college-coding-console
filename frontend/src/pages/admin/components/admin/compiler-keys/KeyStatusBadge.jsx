const KeyStatusBadge = ({ status, keyIndex, activeKeyIndex, exhaustionNotified }) => {
  // For matrix rows, derive status from activeKeyIndex
  let displayStatus = status;
  if (keyIndex !== undefined && activeKeyIndex !== null && keyIndex === activeKeyIndex) {
    displayStatus = 'active';
  }

  const getBadgeClass = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'admin-badge admin-badge--active';
      case 'exhausted':
        return 'admin-badge admin-badge--exhausted';
      case 'waiting':
      default:
        return 'admin-badge admin-badge--inactive';
    }
  };

  return (
    <div className="flex flex-col gap-1 items-center">
      <span className={getBadgeClass(displayStatus)}>
        {displayStatus}
      </span>
      {status === 'exhausted' && (
        <span className={`text-[10px] font-medium ${exhaustionNotified ? 'text-green-600' : 'text-amber-600'}`}>
          {exhaustionNotified ? 'Alert Sent' : 'Alert Pending'}
        </span>
      )}
    </div>
  );
};

export default KeyStatusBadge;
