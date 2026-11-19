import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Runs locally (no API call, no cost). Downloaded from Hugging Face on first
// use (~90 MB) and cached by transformers.js after that. Outputs 384 numbers,
// matching the `chunks.embedding` column.
const MODEL = "Xenova/all-MiniLM-L6-v2";

let extractor: Promise<FeatureExtractionPipeline> | undefined;

/** Loads the model once per process; later calls reuse it. */
function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline("feature-extraction", MODEL, { dtype: "fp32" });
  return extractor;
}

/** One normalized vector per text, in the same order as `texts`. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = await getExtractor();
  const output = await model(texts, { pooling: "mean", normalize: true });

  return output.tolist() as number[][];
}
