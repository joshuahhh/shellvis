set -eu

# TODO: automatic file-descriptor assignment doesn't seem to working

get_fd() {
  fd=2
  max=$(ulimit -n)
  while ((++fd < max)); do
    ! <&$fd && break
  done 2>/dev/null
  export fd
}

get_fd
fr2shFD=$fd
eval "exec $fr2shFD>\"$fr2sh\""
get_fd
sh2frFD=$fd
eval "exec $sh2frFD<\"$sh2fr\""

echo "sh sez: pipe opened"

for i in {1..10}; do
  echo "{ \"i\": $i }" >&${fr2shFD}
  read -u "${sh2frFD}" RESPONSE
  echo "sh sez: got $RESPONSE"
done

eval "exec $fr2shFD>&-"
eval "exec $sh2frFD<&-"

echo "sh sez: all done baybee"
