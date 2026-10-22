## dsh-file-actions v0.1.4

File-type and link-shape coverage, for real delivery folders:

- **`dsh-resource://file/session/<id>/<path>` links now open the menu.** That is how the chat, the Sidebar and the delivery table address a file — before this release those anchors looked like ordinary web links and kept Chromium's menu.
- **Subtitles are text**: `.srt`, `.ass`, `.ssa`, `.vtt`, `.lrc`, `.sbv` get "copy file contents" instead of being treated as binary.
- **Video and audio are their own kinds**: `.mp4/.mov/.webm/.ogv` and `.mp3/.wav/.flac/.m4a/.ogg` get "open in browser" (Chromium plays them in a blob tab) plus save-as; `.mkv/.avi/.wmv` and the rest still get open/reveal/save-as.
- **Wider extension table**: notebooks, LaTeX, shaders, design files (`.psd/.ai/.fig/.sketch/.blend/.fbx/.glb`), disk images, fonts, camera raw and a long tail of source/config formats are now recognised as files instead of being ignored.

Verification: 33 unit tests, 41 real-app assertions on DSH 0.2.1-rc.2.
