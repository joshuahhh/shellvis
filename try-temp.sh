DIRS_AND_MOUNTS="$(mktemp)"
export DIRS_AND_MOUNTS
find / -maxdepth 1 >"$DIRS_AND_MOUNTS"
findmnt --real -r -o target -n >>"$DIRS_AND_MOUNTS"
sort -u -o "$DIRS_AND_MOUNTS" "$DIRS_AND_MOUNTS"

# Calculate UPDATED_DIRS_AND_MOUNTS that contains the merge arguments in LOWER_DIRS
UPDATED_DIRS_AND_MOUNTS="$(mktemp)"
export UPDATED_DIRS_AND_MOUNTS
while IFS="" read -r mountpoint
do
    new_mountpoint=""
    OLDIFS=$IFS
    IFS=":"

    for lower_dir in $LOWER_DIRS
    do
        temp_mountpoint="$lower_dir/upperdir$mountpoint"
        if [ -n "$new_mountpoint" ]
        then
            # If new_mountpoint is not empty, append : and the temp_mountpoint
            new_mountpoint="$new_mountpoint:$temp_mountpoint"
        else
            # If new_mountpoint is empty, just set it to temp_mountpoint
            new_mountpoint="$temp_mountpoint"
        fi
    done
    IFS=$OLDIFS
    # Add the original mountpoint at the end
    new_mountpoint="${new_mountpoint:+$new_mountpoint:}$mountpoint"
    echo "$new_mountpoint" >> "$UPDATED_DIRS_AND_MOUNTS"
done <"$DIRS_AND_MOUNTS"

echo $DIRS_AND_MOUNTS
echo $UPDATED_DIRS_AND_MOUNTS
