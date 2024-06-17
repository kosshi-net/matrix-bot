#!/bin/sh
rm ./build -rv
set -e
mkdir -p build
pushd phash
./build.sh
popd
npx tsc
MAKE_DOCS=1 node build/src/main.mjs

