import helloCode from '../../examples/hello.gg?raw';
import hangulCode from '../../examples/hangul.gg?raw';
import addCode from '../../examples/add.gg?raw';
import countdownCode from '../../examples/countdown.gg?raw';
import fibonacciCode from '../../examples/fibonacci.gg?raw';
import reverseCode from '../../examples/reverse.gg?raw';
import truthMachineCode from '../../examples/truth_machine.gg?raw';
import factorialCode from '../../examples/factorial.gg?raw';
import gcdCode from '../../examples/gcd.gg?raw';
import isPrimeCode from '../../examples/is_prime.gg?raw';
import gugudanCode from '../../examples/gugudan.gg?raw';
import bottlesCode from '../../examples/99bottles.gg?raw';
import palindromeCode from '../../examples/palindrome.gg?raw';
import caesarCipherCode from '../../examples/caesar_cipher.gg?raw';
import sortCode from '../../examples/sort.gg?raw';
import rpnCalcCode from '../../examples/rpn_calc.gg?raw';

export type ExampleCategory = 'basic' | 'algorithm' | 'text' | 'diagnostic';

export interface ExampleProgram {
  id: string;
  category: ExampleCategory;
  title: string;
  description: string;
  code: string;
  defaultStdin: string;
}

export const EXAMPLE_CATEGORY_LABELS: Record<ExampleCategory, string> = {
  basic: '기초',
  algorithm: '알고리즘',
  text: '문자열 · 파서',
  diagnostic: '진단',
};

export const EXAMPLES: ExampleProgram[] = [
  {
    id: 'hello',
    category: 'basic',
    title: '1. Hello, World!',
    description: '기본적인 아스키 코드 조합과 야~르! 문자 출력을 보여줍니다.',
    defaultStdin: '',
    code: helloCode.trimEnd(),
  },
  {
    id: 'hangul',
    category: 'basic',
    title: '2. 안녕, 줴줴! (한글 UTF-8)',
    description: "앞에 '어'를 붙여 큰 자릿수를 만들고 한글 유니코드를 출력합니다.",
    defaultStdin: '',
    code: hangulCode.trimEnd(),
  },
  {
    id: 'add',
    category: 'basic',
    title: '3. A + B 계산기',
    description: '표준 입력(stdin)에서 두 정수를 읽어 더한 뒤 줄바꿈과 함께 출력합니다.',
    defaultStdin: '12 30',
    code: addCode.trimEnd(),
  },
  {
    id: 'countdown',
    category: 'basic',
    title: '4. 5 → 1 카운트다운',
    description: '아뇨아뇨~ (WHILE) 반복문과 쥐랄(DUP)으로 카운트다운을 출력합니다.',
    defaultStdin: '',
    code: countdownCode.trimEnd(),
  },
  {
    id: 'fibonacci',
    category: 'basic',
    title: '5. 피보나치 앞 10항',
    description: '힙 메모리(쥐랄!/쥐~랄!)와 조건문(아뇨아뇨?)을 결합해 피보나치 수열을 출력합니다.',
    defaultStdin: '',
    code: fibonacciCode.trimEnd(),
  },
  {
    id: 'truth_machine',
    category: 'basic',
    title: '6. 진리 기계 (Truth Machine)',
    description: '0 입력 시 0을 출력하고 종료, 1 입력 시 step 상한까지 1을 계속 출력합니다.',
    defaultStdin: '0',
    code: truthMachineCode.trimEnd(),
  },
  {
    id: 'factorial',
    category: 'algorithm',
    title: '7. 팩토리얼 (N!)',
    description: '입력 정수 N에 대해 BigInt 정밀도로 N!을 계산합니다.',
    defaultStdin: '10',
    code: factorialCode.trimEnd(),
  },
  {
    id: 'gcd',
    category: 'algorithm',
    title: '8. 최대공약수 (GCD)',
    description: '유클리드 호제법(나머지 연산)으로 두 정수의 최대공약수를 구합니다.',
    defaultStdin: '48 18',
    code: gcdCode.trimEnd(),
  },
  {
    id: 'is_prime',
    category: 'algorithm',
    title: '9. 소수 판별 (isPrime)',
    description: '제곱근 범위까지의 시험 나눗셈과 BREAK로 소수 여부를 판별합니다.',
    defaultStdin: '97',
    code: isPrimeCode.trimEnd(),
  },
  {
    id: 'gugudan',
    category: 'algorithm',
    title: '10. 구구단',
    description: '입력된 단(N)의 1~9 곱셈표를 출력합니다.',
    defaultStdin: '7',
    code: gugudanCode.trimEnd(),
  },
  {
    id: 'sort',
    category: 'algorithm',
    title: '11. 힙 선택 정렬',
    description: 'N과 N개의 정수를 힙 메모리에 적재한 뒤 제자리 선택 정렬합니다.',
    defaultStdin: '5\n5 3 -2 9 0',
    code: sortCode.trimEnd(),
  },
  {
    id: 'reverse',
    category: 'text',
    title: '12. 문자열 뒤집기 (유니코드)',
    description: '아 예?로 EOF(-1)까지 한 글자씩 읽어 메모리에 저장한 뒤 역순으로 출력합니다.',
    defaultStdin: '줴줴🔥ABC',
    code: reverseCode.trimEnd(),
  },
  {
    id: '99bottles',
    category: 'text',
    title: '13. 99 Bottles of Beer',
    description: '입력 수 N부터 0까지 단·복수 분기를 포함해 가사를 출력합니다.',
    defaultStdin: '3',
    code: bottlesCode.trimEnd(),
  },
  {
    id: 'palindrome',
    category: 'text',
    title: '14. 회문(Palindrome) 판별',
    description: '아 예?와 투 포인터, CONTINUE를 사용해 유니코드 회문 여부를 검사합니다.',
    defaultStdin: '기러기',
    code: palindromeCode.trimEnd(),
  },
  {
    id: 'caesar_cipher',
    category: 'text',
    title: '15. 시저 암호 (Caesar Cipher)',
    description: '첫 줄의 정수 이동량 k만큼 영문자만 회전 암호화하여 출력합니다.',
    defaultStdin: '3\nHello, 줴줴!',
    code: caesarCipherCode.trimEnd(),
  },
  {
    id: 'rpn_calc',
    category: 'text',
    title: '16. 후위 표기식(RPN) 계산기',
    description: 'Lookahead 파싱과 힙 스택으로 사칙연산·나머지 후위 수식을 계산합니다.',
    defaultStdin: '3 4 + 2 * 7 -',
    code: rpnCalcCode.trimEnd(),
  },
  {
    id: 'syntax-errors',
    category: 'diagnostic',
    title: '17. 문법 에러 체험하기',
    description: '미등록 단어, 오타, 점/쉼표 혼합, 짝이 맞지 않는 블록을 정적 검사기가 한 번에 잡아냅니다.',
    defaultStdin: '',
    code: `// 요이~ 없이 시작하고 여러 오타가 섞인 코드
어엄
엄.,
아예?
야르
지~~~~~랄
아뇨아뇨?
  넌 나가라!`,
  },
];
