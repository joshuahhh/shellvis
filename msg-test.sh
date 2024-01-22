set -eu

exec {fr2shFD}>$fr2sh
exec {sh2frFD}<$sh2fr

echo "sh sez: pipe opened"

for i in {1..10}; do
  echo "{ \"i\": $i }" >&${fr2shFD}
  read -u "${sh2frFD}" RESPONSE
  echo "sh sez: got $RESPONSE"
done

exec {fr2shFD}>&-
exec {sh2frFD}<&-

echo "sh sez: all done baybee"
