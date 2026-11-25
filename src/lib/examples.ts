import helloCode from '../../examples/hello.gg?raw';
import hangulCode from '../../examples/hangul.gg?raw';
import addCode from '../../examples/add.gg?raw';
import countdownCode from '../../examples/countdown.gg?raw';
import fibonacciCode from '../../examples/fibonacci.gg?raw';
import reverseCode from '../../examples/reverse.gg?raw';

export interface ExampleProgram {
  id: string;
  title: string;
  description: string;
  code: string;
  defaultStdin: string;
}

export const EXAMPLES: ExampleProgram[] = [
  {
    id: 'hello',
    title: '1. Hello, World!',
    description: '기본적인 아스키 코드 조합과 티~원! 문자 출력을 보여줍니다.',
    defaultStdin: '',
    code: helloCode.trimEnd(),
  },
  {
    id: 'hangul',
    title: '2. 안녕, 줴줴! (한글 UTF-8)',
    description: "앞에 '어'를 붙여 큰 자릿수를 만들고 한글 유니코드를 출력합니다.",
    defaultStdin: '',
    code: hangulCode.trimEnd(),
  },
  {
    id: 'add',
    title: '3. A + B 계산기',
    description: '표준 입력(stdin)에서 두 정수를 읽어 더한 뒤 줄바꿈과 함께 출력합니다.',
    defaultStdin: '12 30',
    code: addCode.trimEnd(),
  },
  {
    id: 'countdown',
    title: '4. 5 → 1 카운트다운',
    description: '아뇨아뇨~ (WHILE) 반복문과 쥐랄(DUP)으로 카운트다운을 출력합니다.',
    defaultStdin: '',
    code: countdownCode.trimEnd(),
  },
  {
    id: 'fibonacci',
    title: '5. 피보나치 앞 10항',
    description: '힙 메모리(쥐랄!/쥐~랄!)와 조건문(아뇨아뇨?)을 결합해 피보나치 수열을 출력합니다.',
    defaultStdin: '',
    code: fibonacciCode.trimEnd(),
  },
  {
    id: 'reverse',
    title: '6. 문자열 뒤집기 (유니코드)',
    description: '아 예?로 EOF(-1)까지 한 글자씩 읽어 메모리에 저장한 뒤 역순으로 출력합니다.',
    defaultStdin: '줴줴🔥ABC',
    code: reverseCode.trimEnd(),
  },
  {
    id: 'syntax-errors',
    title: '7. 문법 에러 체험하기',
    description: '미등록 단어, 오타, 점/쉼표 혼합, 짝이 맞지 않는 블록을 정적 검사기가 한 번에 잡아냅니다.',
    defaultStdin: '',
    code: `// 요이~ 없이 시작하고 여러 오타가 섞인 코드
어엄
엄.,
아예?
티원
지~~~~~랄
아뇨아뇨?
  넌 나가라!`,
  },
];
