# set -eu

sleep 1

true && echo "true"
false && echo "false"

fr_exitcode 10

x=$(ls)

cd ..

diff <(ls) <(echo $x)

ls

sleep 2

echo $x

ls | rev

echo "hello" | rev

# sleep 1

# echo "#1" | echo "#2"

# echo "#1" | echo "#2" | echo "#3"

# false

# ls

# ls | rev


# echo "#2" | rev

# echo "#3"

# echo "#1"

# echo "#2A" | echo "#2B" | echo "2C"

# echo "#3"

# for i in {1..3}; do
#   echo "i=$i"
#   for j in {1..3}; do
#     echo "i,j=$i,$j"
#     # sleep 1
#   done
# done | rev



# for f in *.sh; do
#   # copy each $f from .sh to .txt
#   cp $f ${f%.sh}.doc
#   echo $f is cool
# done

# ls
