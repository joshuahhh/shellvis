# echo "hi"

echo "yay"

exit

rm *.sh

for i in {1..2}; do
  echo "i=$i"
  for j in {1..2}; do
    echo "i,j=$i,$j"
  done
done

# exit

while getopts "h?vf:" opt; do
  case "$opt" in
    h|\?)
      show_help
      exit 0
      ;;
    v)  verbose=1
      ;;
    f)  output_file=$OPTARG
      ;;
  esac
done


X=3

unset X


ls | rev

# set -eu

echo "hello"

git st

git ci -am "yoooo"

git log -1

pushd node_modules

diff <(ls) <(ls ..)

popd

rm doesntexist

mv test test2

rm *.sh

ls

cd node_modules

# exit

echo 1
echo 2
echo 3
echo 4
echo 5
echo 6
echo 7
echo 8
echo 9
echo 10
echo 11
echo 12
echo 13
echo 14
echo 15
echo 16
echo 17
echo 18
echo 19
echo 20

echo "hi" | cat | cat

true && echo "true"
false && echo "false"

fr_exitcode 10

sleep 1

x=$(ls)

cd ..

ls

sleep 2

echo $x

ls | rev

echo "hello" | rev

sleep 1

echo "#1" | echo "#2"

echo "#1" | echo "#2" | echo "#3"

false

ls

ls | rev


echo "#2" | rev

echo "#3"

echo "#1"

echo "#2A" | echo "#2B" | echo "2C"

echo "#3"

for i in {1..3}; do
  echo "i=$i"
  for j in {1..3}; do
    echo "i,j=$i,$j"
    # sleep 1
  done
done | rev



for f in *.sh; do
  # copy each $f from .sh to .txt
  cp $f ${f%.sh}.doc
  echo $f is cool
done

ls
