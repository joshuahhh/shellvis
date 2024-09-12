#!/bin/bash

for f in *.jpg; do
  year=$(exiftool -CreateDate -T $f | cut -c1-4)
  mkdir -p $year
  mv $f $year
done
