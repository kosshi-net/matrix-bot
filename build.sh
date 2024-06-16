#!/bin/sh
mkdir -p build
pushd phash
./build.sh
popd
npx tsc
MAKE_DOCS=1 node build/main.mjs

