export const CONFIG = {
  cache: "tgvoice-models-v1",
  rate: 16000,
  progressCap: 0.99,
  engine: { scripts: ["sherpa-onnx-asr.js", "sherpa-onnx-wasm-web.js"], wasm: "sherpa-onnx-wasm-web.wasm" },
  recognizer: { numThreads: 1, debug: 0, provider: "cpu", featureDim: 80, decodingMethod: "greedy_search" },
  models: {
    uk: {
      label: "Українська", type: "moonshine2", approxMB: 120,
      files: {
        encoder: "https://huggingface.co/onnx-community/moonshine-tiny-uk-ONNX/resolve/main/onnx/encoder_model_quantized.onnx",
        mergedDecoder: "https://huggingface.co/onnx-community/moonshine-tiny-uk-ONNX/resolve/main/onnx/decoder_model_merged_quantized.onnx",
        tokens: "https://huggingface.co/csukuangfj2/sherpa-onnx-moonshine-base-uk-quantized-2026-02-27/resolve/main/tokens.txt",
      },
    },
    ru: {
      label: "Русский", type: "transducer", approxMB: 71,
      files: {
        encoder: "https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/encoder.int8.onnx",
        decoder: "https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/decoder.onnx",
        joiner: "https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/joiner.int8.onnx",
        tokens: "https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-ru-int8-2025-04-20/resolve/main/tokens.txt",
      },
    },
    en: {
      label: "English", type: "moonshine", approxMB: 40,
      files: {
        preprocessor: "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/preprocess.onnx",
        encoder: "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/encode.int8.onnx",
        uncachedDecoder: "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/uncached_decode.int8.onnx",
        cachedDecoder: "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/cached_decode.int8.onnx",
        tokens: "https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8/resolve/main/tokens.txt",
      },
    },
  },
};
