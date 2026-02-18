type OpenCVRuntime = {
  onRuntimeInitialized?: () => void;
};

declare global {
  interface Window {
    cv?: OpenCVRuntime;
  }

  var cv: OpenCVRuntime | undefined;
}

export {};
