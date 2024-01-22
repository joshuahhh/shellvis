set -e

for f in *.sh; do
  # copy each $f from .sh to .txt
  cp $f ${f%.sh}.doc
  echo $f is cool
done

ls
