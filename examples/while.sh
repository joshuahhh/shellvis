echo hi

x=1
while [ $x -le 5 ]
do
  echo "Welcome $x times"
  x=$(( $x + 1 ))
done

# for comparison, a for loop
for x in {1..5}; do
  echo "Welcome $x times"
done
