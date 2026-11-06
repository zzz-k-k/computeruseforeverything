# dsh-see-now
Source: https://github.com/SAOS-3624/dsh-see-now
Revision: 59719eabba8b88f0b425c1839dfdc30be3c315a5
License and NOTICE: dsh-see-now-package/LICENSE and NOTICE
Vendored src and packaged Python UI assets. runner.js includes documented enableWindow/enableAudio opt-out patch. runner additionally calls pipeline.finish() at file EOF and drains queued images before returning file-ended, so separate start/watch calls do not lose short files. Scoring/selection/packing algorithms are unchanged.

Local binary dependencies used for this build
- FFmpeg: @ffmpeg-installer/darwin-arm64 4.1.5 package, ffmpeg 4.4.1-era build
- FFprobe: @ffprobe-installer/darwin-arm64 5.0.1 package
- Node: current host runtime copied into bin/node by build.mjs
Use binary --version for exact compiler and license configuration. Distribution to other machines requires compatible platform binaries and their licensing notices.
