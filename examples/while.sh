echo hi

x=1
while [ $x -le 5 ]
do
  echo "Welcome $x times"
  x=$(( $x + 1 ))
done

# no iterations
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
