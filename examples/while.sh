echo hi

x=1
while [ $x -le 5 ]
do
  echo "Welcome $x times"
  x=$(( $x + 1 ))
done

# no execution of body
while false
do
  echo "hi"
done

# no iterations, no execution
if false
then
  while true
  do
    echo "hi"
  done
fi

# for comparison, a for loop
for x in {1..5}; do
  echo "Welcome $x times"
done


yay () {
  for x in {1..5}; do
    echo "yay! $x"
  done
}

# an idiomatic "while read" loop
yay |
while read LINE; do
  echo "read: $LINE"
done
