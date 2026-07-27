import { useEffect, useState } from "react";
import { MarketArrow } from "./MarketArrow";
import {
  downloadSignalSharePng,
  leanChipLabel,
  shareSignalCard,
  type SignalSharePayload,
} from "../lib/signal-share";

type Props = {
  payload: SignalSharePayload;
  onClose?: () => void;
};

function stars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < n ? "star is-on" : "star"} aria-hidden="true">
      ★
    </span>
  ));
}

/** Recipient / reconstructable share view — same card content + Share again. */
export function ShareView({ payload, onClose }: Props) {
  const up = payload.bias === "up";
  const [status, setStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 2200);
    return () => window.clearTimeout(id);
  }, [status]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onShare() {
    const { result, url, blob } = await shareSignalCard(payload);
    if (result === "shared") {
      setStatus("Shared");
      return;
    }
    if (result === "aborted") return;
    if (result === "copied") {
      setStatus("Copied");
      return;
    }
    if (result === "preview" && blob) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStatus("Link copied");
      return;
    }
    setStatus("Couldn’t share");
    void url;
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  }

  return (
    <div className={`share-view ${up ? "theme-up" : "theme-down"}`}>
      <div className="share-view__card" role="img" aria-label="ArrowBeat signal share card">
        <p className="share-view__brand">
          Arrow<span>Beat</span>
        </p>
        <p className="share-view__tag">Daily market probability</p>

        <div className="share-view__body">
          <div className="share-view__arrow">
            <MarketArrow bias={payload.bias} idSuffix="share" />
          </div>
          <div className="share-view__stats">
            <p className="share-view__label">{payload.label}</p>
            <p className="bias-chip">{leanChipLabel(payload.bias)}</p>
            <p className="share-view__prob">
              {payload.probability.toFixed(1)}
              <span>%</span>
            </p>
            <p className="share-view__prob-sub">
              Probability of {up ? "higher" : "lower"} close
            </p>
            <div className="share-view__confidence">
              <p className="confidence-stars" aria-label={`${payload.confidence} of 5 stars`}>
                {stars(payload.confidence)}
              </p>
              <p className="share-view__conf-label">Confidence</p>
            </div>
          </div>
        </div>

        <p className="share-view__stamp">
          {payload.updated ? `Updated ${payload.updated}` : "arrowbeat.com"}
          <span aria-hidden="true"> · </span>
          Not financial advice
        </p>
      </div>

      <div className="share-view__actions">
        <button type="button" className="share-pill" onClick={() => void onShare()}>
          {status === "Shared" || status === "Copied" || status === "Link copied"
            ? status
            : "Share"}
        </button>
        {onClose ? (
          <button type="button" className="share-view__home" onClick={onClose}>
            Open ArrowBeat
          </button>
        ) : null}
      </div>

      {previewUrl ? (
        <SharePreviewModal
          imageUrl={previewUrl}
          blob={previewBlob}
          payload={payload}
          onClose={closePreview}
          onShared={(msg) => setStatus(msg)}
        />
      ) : null}
    </div>
  );
}

type PreviewProps = {
  imageUrl: string;
  blob: Blob | null;
  payload: SignalSharePayload;
  onClose: () => void;
  onShared: (msg: string) => void;
};

export function SharePreviewModal({
  imageUrl,
  blob,
  payload,
  onClose,
  onShared,
}: PreviewProps) {
  async function shareAgain() {
    const { result } = await shareSignalCard(payload, { forcePreview: false });
    if (result === "shared") onShared("Shared");
    else if (result === "copied" || result === "preview") onShared("Link copied");
    else if (result !== "aborted") onShared("Couldn’t share");
  }

  async function copyLink() {
    const { result } = await shareSignalCard(payload, { forcePreview: true });
    if (result === "copied" || result === "preview") onShared("Link copied");
    else onShared("Couldn’t copy");
  }

  return (
    <div className="share-preview" role="dialog" aria-modal="true" aria-label="Share preview">
      <div className="share-preview__backdrop" onClick={onClose} />
      <div className="share-preview__panel">
        <p className="share-preview__title">Share card ready</p>
        <img className="share-preview__img" src={imageUrl} alt="ArrowBeat signal card" />
        <div className="share-preview__actions">
          <button type="button" className="share-pill" onClick={() => void shareAgain()}>
            Share again
          </button>
          <button type="button" className="share-view__home" onClick={() => void copyLink()}>
            Copy link
          </button>
          {blob ? (
            <button
              type="button"
              className="share-view__home"
              onClick={() => downloadSignalSharePng(blob)}
            >
              Download PNG
            </button>
          ) : null}
          <button type="button" className="share-view__home" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
