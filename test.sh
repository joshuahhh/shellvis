ls

for i in {1..10}; do
  echo "Hello world #$((i * 2))" | tee file$i.txt
done

ls

rm file*.txt

ls

echo line 1 > fun.txt
echo line 2 >> fun.txt
ls
