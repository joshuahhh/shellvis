#!/bin/bash

# Back up all the files from the source directory to the
# backup directory.

source_dir="music"
backup_dir="backup/music"

# Loop through files and copy them to the backup directory
for file in $(ls $source_dir); do
  cp $file $backup_dir/
done
