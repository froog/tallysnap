/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VISION_API_KEY: string;
  readonly VITE_VISION_MODEL: string;
  readonly VITE_TEST_BUTTON: string;
  readonly VITE_TEST_IMAGE_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
