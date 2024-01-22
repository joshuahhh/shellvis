set -eu

fr2sh="$1"
sh2fr="$2"

echo "sh sez: $fr2sh $sh2fr"

exec 3>"$fr2sh"  # will hang unless there's a reader
exec 4<"$sh2fr"

echo "sh sez: pipe opened"

for i in {1..10}; do
  echo "{ \"i\": $i }" >&3
  read -u 4 RESPONSE
  echo "sh sez: got $RESPONSE"
done

echo "sh sez: all done baybee"

exec 3>&-
