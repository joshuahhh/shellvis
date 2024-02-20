#!/bin/bash

# Get command-line arguments
srcDir=$1
dstDir=$2

if [ -z "$srcDir" ] || [ -z "$dstDir" ]; then
  echo "Usage: $0 <srcDir> <dstDir>"
  exit 1
fi

for f in `find "$srcDir" -type f -name "*.css"`; do
  # replace $srcDir with $dstDir
  dstFile="${f/$srcDir/$dstDir}"
  local jsFilePath="${dstFilePath}.js"
  echo -n "export default String.raw\`" > "$jsFilePath"
  cat "$srcFilePath" | sed 's/\$/\${'"'"'$'"'"'}/g; s/`/\${'"'"'`'"'"'}/g' >> "$jsFilePath"
  echo "\`;" >> "$jsFilePath"
  echo "Converted: $srcFilePath -> $jsFilePath"
done


# Function to convert CSS to JS
# convertCssToJs() {
#   local srcDir=$1
#   local dstDir=$2

#   # Check if srcDir exists
#   if [ ! -d "$srcDir" ]; then
#     echo "Source directory \"$srcDir\" does not exist."
#     return
#   fi

#   # Check if dstDir exists, if not create it
#   mkdir -p "$dstDir"

#   # Read files in srcDir
#   for srcFilePath in "$srcDir"/*; do
#     local filename=$(basename -- "$srcFilePath")
#     local dstFilePath="$dstDir/$filename"

#     if [ -d "$srcFilePath" ]; then
#       # If it's a directory, call the function recursively
#       convertCssToJs "$srcFilePath" "$dstFilePath"
#     elif [ -f "$srcFilePath" ] && [[ $srcFilePath == *.css ]]; then
#       # If it's a CSS file, convert it to JS
#       local jsFilePath="${dstFilePath}.js"
#       echo -n "export default String.raw\`" > "$jsFilePath"
#       cat "$srcFilePath" | sed 's/\$/\${'"'"'$'"'"'}/g; s/`/\${'"'"'`'"'"'}/g' >> "$jsFilePath"
#       echo "\`;" >> "$jsFilePath"
#       echo "Converted: $srcFilePath -> $jsFilePath"
#     fi
#   done
# }
