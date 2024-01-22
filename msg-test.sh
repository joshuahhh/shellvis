set -eu

source frmsg.sh
frmsg_init

for i in {1..10}; do
  # echo "{ \"i\": $i }" >&${fr2shFD}
  # read -u "${sh2frFD}" RESPONSE
  RESPONSE=$(frmsg_call "{ \"i\": $i }")
  echo "sh sez: got $RESPONSE"
done

# psssh why worry about closing these
# exec {fr2shFD}>&-
# exec {sh2frFD}<&-

echo "sh sez: all done baybee"
