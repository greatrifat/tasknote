import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This project lives inside the VoiceToText repo, which has its own lockfile.
  // Next otherwise infers that outer directory as the workspace root and traces
  // files from there. Pinning the root keeps a local build identical to Vercel,
  // where only this project is checked out and the ambiguity does not arise.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
