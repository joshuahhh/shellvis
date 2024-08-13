#!/bin/bash

# TASK
# ----
# Move each jpg file in this directory to a sub-directory named by the year it
# was taken.

for f in *.jpg; do
  year=$(exiftool -DateTimeOriginal -T $f | cut -c1-4)
  mv $f $year
done
