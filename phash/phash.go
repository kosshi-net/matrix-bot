package main

import (
	"os"
	"strconv"
	"image"
	"fmt"
	"github.com/azr/phash"
)

func main() {
	path := os.Args[1];

	f, err := os.Open(path)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		panic(err)
	}
	hash1 := phash.DTC(img)

	fmt.Printf("%016v", strconv.FormatUint(hash1, 16));
}
