for i in {1..100}; do
  echo "hi$i"
  # sleep 0.2
done

ls

for i in {1..10}; do
  echo "Hello worlddd #$((i * 2))" | tee file$i.txt
done

ls

rm file*.txt

ls

echo line 1 > fun.txt
echo line 2 >> fun.txt
ls
