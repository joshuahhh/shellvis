myfunction () {
  (
    flock -x 9
    echo "myfunction $i start"
    sleep 1
    echo "myfunction $i end"
  ) 9>/tmp/locktest.lock
}


for i in {1..10}; do
  (
    myfunction
    echo "myfunction $i done"
  ) &
done
