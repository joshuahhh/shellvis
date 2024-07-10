#!/bin/bash

for f in *.jpg; do
  exiftool $f
  year=$(exiftool -DateTimeOriginal -T $f | cut -c1-4)
  mkdir $year
  mv $f $year
done
