import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  eyebrow: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="page-header">
      {breadcrumb ? <div className="page-breadcrumb">{breadcrumb}</div> : null}
      <div className="page-header-main">
        <div className="page-header-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="dashboard-title">{title}</h1>
          {description ? (
            <div className="page-description">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
