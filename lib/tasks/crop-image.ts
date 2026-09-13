import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";

async function getImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
    const base64Data = match ? match[1] : imageUrl.split(",")[1];
    return Buffer.from(base64Data || "", "base64");
  }
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
  return Buffer.from(await imageResponse.arrayBuffer());
}

export interface CropImagePayload {
  imageUrl: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface CropImageResult {
  success: boolean;
  outputUrl?: string;
  error?: string;
  duration: number;
}

export async function cropImageFF(payload: CropImagePayload): Promise<CropImageResult> {
  const startTime = Date.now();
  const inFile = join(tmpdir(), `crop-input-${Date.now()}-${Math.random().toString(36).substring(7)}.png`);
  const outFile = join(tmpdir(), `crop-output-${Date.now()}-${Math.random().toString(36).substring(7)}.png`);

  try {
    ffmpeg.setFfmpegPath(ffmpegPath as string);
    ffmpeg.setFfprobePath(ffprobePath.path);

    const imageBuffer = await getImageBuffer(payload.imageUrl);
    await fs.writeFile(inFile, imageBuffer);

    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      ffmpeg.ffprobe(inFile, (err, data) => {
        if (err) return reject(err);
        const stream = (data.streams || []).find((s: any) => s.width && s.height);
        const width = stream?.width || 0;
        const height = stream?.height || 0;
        if (!width || !height) return reject(new Error("Invalid image dimensions"));
        resolve({ width, height });
      });
    });

    const sx = Math.max(0, Math.min(dims.width, Math.round((payload.xPercent / 100) * dims.width)));
    const sy = Math.max(0, Math.min(dims.height, Math.round((payload.yPercent / 100) * dims.height)));
    const sw = Math.max(1, Math.min(dims.width - sx, Math.round((payload.widthPercent / 100) * dims.width)));
    const sh = Math.max(1, Math.min(dims.height - sy, Math.round((payload.heightPercent / 100) * dims.height)));

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inFile)
        .outputOptions(["-y", `-vf crop=${sw}:${sh}:${sx}:${sy}`, "-vframes 1"])
        .output(outFile)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const outBuffer = await fs.readFile(outFile);
    const base64 = outBuffer.toString("base64");
    const outputUrl = `data:image/png;base64,${base64}`;
    const duration = Date.now() - startTime;

    await Promise.allSettled([fs.unlink(inFile), fs.unlink(outFile)]);

    return { success: true, outputUrl, duration };
  } catch (error: any) {
    await Promise.allSettled([fs.unlink(inFile), fs.unlink(outFile)]);
    const duration = Date.now() - startTime;
    return { success: false, error: error?.message || "Failed to crop image", duration };
  }
}
