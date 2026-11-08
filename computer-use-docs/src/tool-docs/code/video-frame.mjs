import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const localVideo = ["-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,avi"];

function fail(code) {
  return Object.assign(new Error(code), { code });
}

function seconds(value) {
  return value == null || value === "N/A" || !Number.isFinite(Number(value))
    ? null : Number(value);
}

// snippet: probe
async function probeVideo(file, ffprobePath, signal) {
  const { stdout } = await exec(ffprobePath, [
    "-v", "error", ...localVideo, "-select_streams", "V:0",
    "-show_frames", "-show_streams",
    "-show_entries", "stream=index,start_time,duration:frame=best_effort_timestamp_time,duration_time,pkt_duration_time",
    "-of", "json", file,
  ], { signal, maxBuffer: 64 * 1024 * 1024 });

  const { frames = [], streams = [] } = JSON.parse(stdout);
  if (!frames.length || !streams.length) throw fail("no_video");
  return { frames, stream: streams[0] };
}

function chooseFrame({ frames, stream }, { timestamp_ms, frame_index }) {
  const times = frames.map(frame => seconds(frame.best_effort_timestamp_time));
  const origin = times[0];
  if (origin === null || times.some((time, i) =>
    time === null || (i > 0 && time < times[i - 1]))) {
    throw fail("timeline_unavailable");
  }

  const relative = times.map(time => Math.round((time - origin) * 1_000_000));
  let index = frame_index;
  if (timestamp_ms !== undefined) {
    const target = Math.round(timestamp_ms * 1000);
    const last = frames.at(-1);
    const lastDuration = seconds(last.duration_time) ?? seconds(last.pkt_duration_time);
    const streamDuration = seconds(stream.duration);
    const lastStart = relative.at(-1);
    const end = lastDuration > 0 ? lastStart + Math.round(lastDuration * 1_000_000)
      : streamDuration === null ? null
      : Math.round(((seconds(stream.start_time) ?? origin) + streamDuration - origin) * 1_000_000);
    if ((end !== null && end > lastStart && target >= end) ||
        ((end === null || end <= lastStart) && target > lastStart)) {
      throw fail("frame_out_of_range");
    }
    index = relative.findLastIndex(time => time <= target);
  }
  if (index < 0 || index >= frames.length) throw fail("frame_out_of_range");
  return { index, timestamp: relative[index] / 1000 };
}
// end-snippet

// snippet: decode
export async function videoFrame(args, { ffmpegPath, ffprobePath, authorizeFile, signal }) {
  const { timestamp_ms, frame_index } = args;
  if ((timestamp_ms === undefined) === (frame_index === undefined) ||
      (timestamp_ms !== undefined && (!Number.isFinite(timestamp_ms) || timestamp_ms < 0)) ||
      (frame_index !== undefined && (!Number.isSafeInteger(frame_index) || frame_index < 0))) {
    throw fail("invalid_frame_selector");
  }

  const file = await authorizeFile(args.path);
  const probe = await probeVideo(file, ffprobePath, signal);
  const { index, timestamp } = chooseFrame(probe, args);
  const { stdout: png } = await exec(ffmpegPath, [
    "-nostdin", "-v", "error", ...localVideo, "-i", file,
    "-map", "0:" + probe.stream.index,
    "-vf", "select=eq(n\\," + index + ")", "-frames:v", "1",
    "-c:v", "png", "-f", "image2pipe", "pipe:1",
  ], { signal, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });

  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    throw fail("frame_decode_failed");
  }
  return {
    result: {
      frame_index: index, timestamp_ms: timestamp,
      width: png.readUInt32BE(16), height: png.readUInt32BE(20),
    },
    images: [{ mime_type: "image/png", bytes: png }],
  };
}
// end-snippet
