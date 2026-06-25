import { Config } from '@remotion/cli/config'

// JPEG frames render faster and are plenty for screen-content promos; bump to png if
// you need alpha. Overwrite outputs so re-renders don't prompt.
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)

// Memory safety on RAM-constrained machines. By default the Rust compositor reserves
// a ~1.8 GB OffthreadVideo frame cache; combined with Chrome + the encode buffer that
// OOMs a 16 GB box with little free RAM ("memory allocation of N bytes failed", exit
// 3221226505 / ERR_INSUFFICIENT_RESOURCES). Cap the cache hard so peak memory stays
// bounded — the clips re-decode on demand instead of all living in RAM. Set here (not
// a CLI flag) because the render-CLI flag is kebab-case and easy to pass wrong; config
// is unambiguous and applies to `remotion render` + the studio alike.
Config.setOffthreadVideoCacheSizeInBytes(180 * 1024 * 1024)
