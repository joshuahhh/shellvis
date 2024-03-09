
f () {
  echo "hi hello" | read ${=1}
  echo "short is $short long is $long"
}
f "short long"
f "long short"

# zmodload zsh/system

# exec {top_stderr}>&2

# echo "top process is $sysparams[pid] vs $$"
# (echo "inner process is $sysparams[pid] vs $$")

# function go () {
#   echo "in a function $sysparams[pid] vs $$"
# }

# function produce () {
#   echo "producer $sysparams[pid] vs $$" >&$top_stderr
#   for i in {1..5}; do
#     echo "producing $i"
#     sleep 0.1
#   done
# }

# function consume () {
#   echo "consumer $sysparams[pid] vs $$" >&$top_stderr
#   while IFS= read -r line; do
#     echo "consuming $line"
#   done
# }

# produce | consume

# function print_one_line () {
#   echo "print one line $sysparams[pid] vs $$" >&$top_stderr
#   echo "one line"
# }

# print_one_line | consume
