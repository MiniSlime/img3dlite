import { useEffect, useState } from "react";

let openCvLoadPromise: Promise<void> | null = null;
const LOAD_TIMEOUT_MS = 30000;
const OPENCV_SCRIPT_ID = "opencv-js-script";
const OPENCV_SRC = `${import.meta.env.BASE_URL}opencv.js`;

type UseOpenCVResult = {
  isReady: boolean;
  error: string | null;
};

function isOpenCVReady(): boolean {
  const cvMaybe = (globalThis as any).cv;
  return Boolean(cvMaybe && typeof cvMaybe.Mat === "function");
}

function ensureOpenCVLoaded(): Promise<void> {
  if (isOpenCVReady()) {
    return Promise.resolve();
  }

  if (openCvLoadPromise) {
    return openCvLoadPromise;
  }

  const promise = new Promise<void>((resolve, reject) => {
    let finished = false;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;

    const done = (fn: () => void) => {
      if (finished) return;
      finished = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
      fn();
    };

    const markReady = () => done(() => resolve());
    const markError = (message: string) => done(() => reject(new Error(message)));

    const attachRuntimeHandler = () => {
      const cvMaybe = (globalThis as any).cv;
      if (!cvMaybe) return;

      if (typeof cvMaybe.Mat === "function") {
        markReady();
        return;
      }

      const previous = cvMaybe.onRuntimeInitialized;
      cvMaybe.onRuntimeInitialized = () => {
        if (typeof previous === "function") {
          previous();
        }
        markReady();
      };
    };

    let script = document.getElementById(OPENCV_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = OPENCV_SCRIPT_ID;
      script.async = true;
      script.src = OPENCV_SRC;
      script.addEventListener("error", () => {
        markError(`OpenCV.js の読み込みに失敗しました。${OPENCV_SRC} を確認してください。`);
      });
      script.addEventListener("load", () => {
        attachRuntimeHandler();
      });
      document.body.appendChild(script);
    } else {
      attachRuntimeHandler();
    }

    intervalId = window.setInterval(() => {
      if (isOpenCVReady()) {
        markReady();
      }
    }, 100);

    timeoutId = window.setTimeout(() => {
      markError(`OpenCV.js の初期化がタイムアウトしました（${LOAD_TIMEOUT_MS / 1000}秒）。`);
    }, LOAD_TIMEOUT_MS);
  }).finally(() => {
    openCvLoadPromise = null;
  });

  openCvLoadPromise = promise;
  return promise;
}

export function useOpenCV(): UseOpenCVResult {
  const [isReady, setIsReady] = useState<boolean>(() => isOpenCVReady());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    ensureOpenCVLoaded()
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "OpenCV.js の初期化に失敗しました。");
          setIsReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { isReady, error };
}
