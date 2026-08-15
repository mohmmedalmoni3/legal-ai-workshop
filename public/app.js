const form = document.querySelector('#registrationForm');
const statusBox = document.querySelector('#status');
const remaining = document.querySelector('#remaining');

async function loadWorkshop(){
  try{
    const res=await fetch('/api/workshop');
    const data=await res.json();
    remaining.textContent = `${data.remaining} مقعد`;
  }catch{remaining.textContent='متاح';}
}

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  statusBox.className='status';
  statusBox.textContent='جارٍ إرسال التسجيل...';
  const fd=new FormData(form);
  const payload=Object.fromEntries(fd.entries());
  if(!form.checkValidity()){
    form.reportValidity();
    statusBox.className='status error';
    statusBox.textContent='يرجى إكمال الحقول المطلوبة.';
    return;
  }
  try{
    const res=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!res.ok) throw new Error(data.message||'تعذر إتمام التسجيل');
    statusBox.className='status success';
    statusBox.textContent=`✓ ${data.message} رقم التسجيل: ${data.registrationId}`;
    remaining.textContent=`${data.remaining} مقعد`;
    form.reset();
  }catch(err){
    statusBox.className='status error';
    statusBox.textContent=`⚠ ${err.message}`;
  }
});
loadWorkshop();
