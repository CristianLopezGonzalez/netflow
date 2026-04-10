interface NoticeBannerProps {
  message: string;
  kind: "error" | "success" | "info";
}

const kindClasses: Record<NoticeBannerProps["kind"], string> = {
  error: "notice-banner--error",
  success: "notice-banner--success",
  info: "notice-banner--info",
};

const kindLabel: Record<NoticeBannerProps["kind"], string> = {
  error: "ERROR",
  success: "OK",
  info: "INFO",
};

const kindIcon: Record<NoticeBannerProps["kind"], string> = {
  error: "!",
  success: "OK",
  info: "i",
};

export const NoticeBanner = ({ message, kind }: NoticeBannerProps) => {
  if (!message) {
    return null;
  }

  const role = kind === "error" ? "alert" : "status";
  const ariaLive = kind === "error" ? "assertive" : "polite";

  return (
    <p
      className={`notice-banner px-4 py-3 text-sm leading-relaxed ${kindClasses[kind]}`}
      role={role}
      aria-live={ariaLive}
    >
      <span className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-current/30 px-1 text-[10px] font-bold tracking-wide">
          {kindIcon[kind]}
        </span>
        <span>
          <span className="mr-1 font-bold tracking-wide">{kindLabel[kind]}:</span>
          <span>{message}</span>
        </span>
      </span>
    </p>
  );
};
