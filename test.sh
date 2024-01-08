echo "go time!"

for i in {1..10}
do
  # double i
  j=$((i*2))
  echo "Welcome $i, double is $j"
  # write to stderr
  # echo " & some stderr" 1>&2
  sleep 1
  echo "fun file" > "fun$i.txt"
done

echo "all done"
