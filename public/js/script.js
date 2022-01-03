$(document).ready(function() {
    $('tr.clickable-query-row').click(function(){
        $('tr.clickable-query-row').removeClass('table-warning');
        $(this).addClass('table-warning');
    });
});

$(document).ready(function() {
    $('tr.clickable-query-row').dblclick(function(){
        $(this).removeClass('table-warning');

        if ($(this).hasClass('table-primary')) {
            $(this).removeClass('table-primary');
        } else {
            $(this).addClass('table-primary');
        }
    });
});
