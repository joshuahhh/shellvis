echo "hei"
echo "yay"
echo "error" 1>&2
false

# for i in {1..3}; do
#   echo "i=$i"
#   for j in {1..3}; do
#     echo "i,j=$i,$j"
#     # sleep 1
#   done
# done | rev


# true && echo "true" 1>&2
# false && echo "false" 1>&2

# for f in *.sh; do
#   # copy each $f from .sh to .txt
#   cp $f ${f%.sh}.doc
#   echo $f is cool
# done

# ls
