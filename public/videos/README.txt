Hero background videos (self-hosted, native <video>)
=====================================================

Drop your MP4 files in this folder. The HeroVideo component loads them from
/videos/<name>.mp4 and falls back to the YouTube embed only while a file is
missing.

Default file used by every page:
  hero.mp4

Optional per-page files (pass src="/videos/<name>.mp4" to <HeroVideo />):
  store.mp4      -> store overview
  careers.mp4    -> jobs / apply / team / referral

Recommended encoding (starts instantly, small, no audio needed):
  ffmpeg -i input.mp4 -an -vf "scale=1920:-2" -c:v libx264 -profile:v high \
         -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart hero.mp4

  -an                 strip audio (hero is muted anyway, saves ~30%)
  -movflags +faststart put the index at the front so playback starts immediately
  keep clips short (15-30 s loop) and ideally under ~8-10 MB

Own YouTube uploads can be downloaded as MP4 via YouTube Studio ->
Content -> (video) -> ... -> Download.
