import { task } from "@trigger.dev/sdk/v3";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";

async function getVideoBuffer(videoUrl: string): Promise<Buffer> {
  if (videoUrl.startsWith("data:")) {
    const match = videoUrl.match(/^data:video\/\w+;base64,(.+)$/);
    const base64Data = match ? match[1] : videoUrl.split(",")[1];
    return Buffer.from(base64Data || "", "base64");
  }
  const videoResp = await fetch(videoUrl, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
  });
  if (!videoResp.ok) throw new Error(`Failed to fetch video: ${videoResp.statusText}`);
  return Buffer.from(await videoResp.arrayBuffer());
}

export const extractFrameTask = task({
  id: "extract-frame",
  run: async (
    payload: {
      videoUrl: string;
      timestamp: string;
    },
    { ctx }
  ) => {
    return await extractFrameFF(payload);
  },
});

export async function extractFrameFF(payload: {
  videoUrl: string;
  timestamp: string;
}): Promise<{ success: boolean; outputUrl?: string; error?: string; duration: number }> {
  const startTime = Date.now();
  const inFile = join(tmpdir(), `frame-input-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`);
  const outFile = join(tmpdir(), `frame-output-${Date.now()}-${Math.random().toString(36).substring(7)}.png`);

  try {
    ffmpeg.setFfmpegPath(ffmpegPath as string);
    ffmpeg.setFfprobePath(ffprobePath.path);

    const videoBuffer = await getVideoBuffer(payload.videoUrl);
    await fs.writeFile(inFile, videoBuffer);

    const durationSec = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inFile, (err, data) => {
        if (err) return reject(err);
        const format = data.format || {};
        const dur = Number(format.duration) || 0;
        resolve(dur);
      });
    });

    let timestampSeconds = 0;
    if (typeof payload.timestamp === "string" && payload.timestamp.includes("%")) {
      const pct = Math.max(0, Math.min(100, parseFloat(payload.timestamp.replace("%", "")) || 0));
      timestampSeconds = (pct / 100) * durationSec;
    } else {
      timestampSeconds = Math.max(0, Math.min(durationSec, parseFloat(String(payload.timestamp)) || 0));
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inFile)
        .seekInput(timestampSeconds)
        .frames(1)
        .outputOptions(["-f image2"])
        .output(outFile)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const outBuffer = await fs.readFile(outFile);
    const base64 = outBuffer.toString("base64");
    const frameImageUrl = `data:image/png;base64,${base64}`;
    const duration = Date.now() - startTime;

    await Promise.allSettled([fs.unlink(inFile), fs.unlink(outFile)]);

    return { success: true, outputUrl: frameImageUrl, duration };
  } catch (error: any) {
    await Promise.allSettled([fs.unlink(inFile), fs.unlink(outFile)]);
    const duration = Date.now() - startTime;
    return { success: false, error: error?.message || "Failed to extract frame", duration };
  }
}
