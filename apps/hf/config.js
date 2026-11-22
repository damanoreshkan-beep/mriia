export const CONFIG = {
  api: "https://huggingface.co/api/",
  site: "https://huggingface.co/",
  spaces: "https://huggingface.co/spaces/",
  timeoutMs: 10000,
  limit: "40",
  sorts: { trending: "trendingScore", newest: "createdAt", likes: "likes" },
  expand: ["downloads", "likes", "pipeline_tag", "library_name", "createdAt", "gated"],
};
