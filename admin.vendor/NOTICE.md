# HEIC decoder notices and source

The TOOHUU admin uses **libheif 1.23.5** with **libde265 1.0.16** for HEIC decoding. These are separately loaded, replaceable libraries. The application does not modify their code.

`libheif-1.23.5.js` is the unmodified `src/lib/libheif-without-unsafe-eval.js` from **heic-to 1.6.5**, maintained by Hopper Gee. This is the pure JavaScript CSP build (`USE_UNSAFE_EVAL=0`, `USE_WASM=0`), with no runtime CDN or external decoding service. The application supplies its own worker and does not use heic-to's conversion wrapper.

Licenses distributed alongside this file:

- [heic-to LGPL-3.0-or-later notice and license](./LICENSE-heic-to.txt)
- [libheif notices and licenses](./LICENSE-libheif.txt)
- [libde265 notices and licenses](./LICENSE-libde265.txt)
- [GNU General Public License version 3](./GPL-3.0.txt)

The full corresponding library source archives, including their copyright notices, configuration, and build scripts, are supplied alongside the JavaScript:

- [libheif 1.23.5 source](./libheif-1.23.5-source.tar.gz)
- [libde265 1.0.16 source](./libde265-1.0.16-source.tar.gz)

Upstream provenance:

- [heic-to source at its published npm git revision](https://github.com/hoppergee/heic-to/tree/f6b3c42d02e6118e1b88fb279baf0fc6184747f8)
- [Exact CSP JavaScript source](https://github.com/hoppergee/heic-to/blob/f6b3c42d02e6118e1b88fb279baf0fc6184747f8/src/lib/libheif-without-unsafe-eval.js)
- [heic-to 1.6.5 npm archive](https://registry.npmjs.org/heic-to/-/heic-to-1.6.5.tgz)
- [libheif v1.23.5](https://github.com/strukturag/libheif/tree/v1.23.5)
- [libde265 v1.0.16](https://github.com/strukturag/libde265/tree/v1.0.16)

The downloaded npm archive was verified against its published SHA-512 integrity:

```
sha512-xPH6gvrzSRIFo/GyzYbr+DZX1JoQliw1oJBT1PCduR0ruDVs1DjlAdU1m5Thed2ZXBoLqYMCd5UXiJteRl3BNQ==
```

`SHA256SUMS.json` records the local files' SHA-256 values. From the repository root, run `node scripts/verify-heic-vendor.mjs` to check them.

## Rebuilding or replacing the library

The supplied libheif source contains `build-emscripten.sh`, `post.js`, the decoder bindings, and the C/C++ source. Follow that script's tool requirements (Emscripten, cmake, make, pkg-config, libtool and related build tools). Extract the two source archives. The build script accepts a locally supplied `libde265-1.0.16.tar.gz`, or can fetch the upstream release itself. The upstream heic-to README documents these settings:

```sh
mkdir buildjs
cd buildjs
LIBDE265_VERSION=1.0.16 USE_UNSAFE_EVAL=0 USE_WASM=0 ../build-emscripten.sh ..
```

Use `USE_ES6=1` or the equivalent default-export wrapper when producing an ESM replacement. On macOS, the upstream heic-to instructions describe adapting the script's exported-symbol discovery to Homebrew `llvm-nm`. Exact byte-for-byte output additionally depends on the upstream compiler/toolchain version; the vendored file is copied from the verified published package instead of rebuilt locally.

To use a compatible modified decoder, replace `admin.vendor/libheif-1.23.5.js`, update its recorded checksum, and rebuild the site. `admin.heic-worker.js` imports the library's default `buildLibheif` factory and uses `HeifDecoder`, image handles, and the exported release methods. Application source and the worker remain separate and readable.
