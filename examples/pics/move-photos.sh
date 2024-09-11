#!/bin/bash

for f in *.jpg; do
  year=$(exiftool -DateTimeOriginal -T $f | cut -c1-4)
  mkdir $year
  mv $f $year
done
