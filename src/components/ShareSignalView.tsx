import { useEffect, useState } from "react";
import { MarketArrow } from "./MarketArrow";
import {
  copyText,
  downloadBlob,
  leanLabel,
  renderSignalSharePng,
  shareSignalPayload,
  type SignalSharePayload,
} from "../lib/signal-share";

type ShareSignalViewProps = {
  payload: SignalSharePayload;
  onClose: () => void;
};

function stars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < n ? "star is-on" : "star"} aria-hidden="true">
      ★
    </span>
  ));
}

/** Full-page share card for recipients (`?view=share&…`) — same visual as the PNG. */
export function ShareSignalView({ payload, onClose }: ShareSignalViewProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    objectUrl: string;
    blob: Blob;
  } | null>(null);

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 2200);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.objectUrl);
    };
  }, [preview]);

  async function onShare() {
    const result = await shareSignalPayload(payload);
    if (result.ok) {
      setStatus(result.mode === "copied" ? "Copied" : "Shared");
      return;
    }
    if (result.mode === "aborted") return;
    if (result.mode === "failed") {
      setStatus("Couldn’t share");
      return;
    }
    if (result.blob) {
      if (preview) URL.revokeObjectURL(preview.objectUrl);
      setPreview({
        url: result.url,
        blob: result.blob,
        objectUrl: URL.createObjectURL(result.blob),
      });
      setStatus("Link copied");
    }
  }

  const up = payload.bias === "up";

  return (
    <div className={`share-view ${up ? "theme-up" : "theme-down"}`}>
      <p className="share-view__eyebrow">Shared signal</p>
      <SignalShareCard payload={payload} />
      <div className="share-view__actions">
        <button type="button" className="share-pill share-pill--lg" onClick={() => void onShare()}>
          {status === "Copied" || status === "Link copied" ? status : "Share"}
        </button>
        <button type="button" className="share-view__secondary" onClick={onClose}>
          Open dashboard
        </button>
      </div>
      {status && status !== "Copied" && status !== "Link copied" ? (
        <p className="share-view__status" role="status">
          {status}
        </p>
      ) : null}
      {preview ? (
        <SharePreviewModal
          objectUrl={preview.objectUrl}
          shareUrl={preview.url}
          blob={preview.blob}
          payload={payload}
          onClose={() => {
            URL.revokeObjectURL(preview.objectUrl);
            setPreview(null);
          }}
          onStatus={setStatus}
        />
      ) : null}
    </div>
  );
}

type CardProps = {
  payload: SignalSharePayload;
  className?: string;
};

export function SignalShareCard({ payload, className = "" }: CardProps) {
  const up = payload.bias === "up";
  return (
    <article
      className={`signal-share-card ${up ? "is-up" : "is-down"} ${className}`}
      aria-label="ArrowBeat signal share card"
    >
      <header className="signal-share-card__brand">
        <p className="signal-share-card__logo">
          Arrow<span>Beat</span>
        </p>
        <p className="signal-share-card__tag">Daily market probability</p>
      </header>
      <div className="signal-share-card__body">
        <div className="signal-share-card__arrow">
          <MarketArrow bias={payload.bias} idSuffix="share" />
        </div>
        <div className="signal-share-card__stats">
          <p className="bias-chip">{leanLabel(payload.bias)}</p>
          <p className="signal-share-card__label">{payload.label}</p>
          <p className="signal-share-card__prob-label">
            Probability of {up ? "higher" : "lower"} close
          </p>
          <p className="signal-share-card__prob">
            {payload.probability.toFixed(1)}
            <span>%</span>
          </p>
          <p className="signal-share-card__conf-label">Confidence</p>
          <p
            className="confidence-stars"
            aria-label={`${payload.confidence} of 5 stars`}
          >
            {stars(payload.confidence)}
          </p>
        </div>
      </div>
      <footer className="signal-share-card__foot">
        <span>{payload.updated ?? "ArrowBeat signal"}</span>
        <span>arrowbeat.com</span>
      </footer>
    </article>
  );
}

type ModalProps = {
  objectUrl: string;
  shareUrl: string;
  blob: Blob;
  payload: SignalSharePayload;
  onClose: () => void;
  onStatus: (s: string | null) => void;
};

export function SharePreviewModal({
  objectUrl,
  shareUrl,
  blob,
  payload,
  onClose,
  onStatus,
}: ModalProps) {
  async function shareAgain() {
    const result = await shareSignalPayload(payload);
    if (result.ok) {
      onStatus("Shared");
      onClose();
      return;
    }
    if (result.mode === "aborted") return;
    if (result.mode === "failed") {
      onStatus("Couldn’t share");
      return;
    }
    onStatus("Link ready");
  }

  async function onCopy() {
    const ok = await copyText(shareUrl);
    onStatus(ok ? "Copied" : "Couldn’t copy");
  }

  return (
    <div className="share-modal" role="dialog" aria-modal="true" aria-label="Share preview">
      <button type="button" className="share-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="share-modal__panel">
        <img className="share-modal__img" src={objectUrl} alt="ArrowBeat signal share card" />
        <div className="share-modal__actions">
          <button type="button" className="share-pill" onClick={() => void shareAgain()}>
            Share again
          </button>
          <button type="button" className="share-view__secondary" onClick={() => void onCopy()}>
            Copy link
          </button>
          <button
            type="button"
            className="share-view__secondary"
            onClick={() => downloadBlob(blob, "arrowbeat-signal.png")}
          >
            Download image
          </button>
        </div>
        <p className="share-modal__url">{shareUrl}</p>
      </div>
    </div>
  );
}

/** Hook-friendly helper used by the dashboard Share pill (preview modal state). */
export async function runDashboardSignalShare(
  payload: SignalSharePayload,
): Promise<{
  status: string | null;
  preview: { url: string; objectUrl: string; blob: Blob } | null;
}> {
  const result = await shareSignalPayload(payload);
  if (result.ok) {
    return { status: "Shared", preview: null };
  }
  if (result.mode === "aborted") {
    return { status: null, preview: null };
  }
  if (result.mode === "failed") {
    return { status: "Couldn’t share", preview: null };
  }
  // Ensure blob exists for preview; regenerate if missing
  const blob = result.blob ?? (await renderSignalSharePng(payload));
  return {
    status: "Link copied",
    preview: {
      url: result.url,
      blob,
      objectUrl: URL.createObjectURL(blob),
    },
  };
}
